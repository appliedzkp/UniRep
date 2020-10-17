import chai from "chai"
import { ethers } from "@nomiclabs/buidler"
import { Contract, Signer, Wallet } from "ethers"
import { genIdentity, genIdentityCommitment } from 'libsemaphore'

const { expect } = chai

import {
    compileAndLoadCircuit,
    executeCircuit,
    genVerifyEpochKeyProofAndPublicSignals,
    verifyEPKProof,
} from './utils'
import { deployUnirep, genEpochKey, getTreeDepthsForTesting } from '../utils'

import {
    genRandomSalt,
    IncrementalQuinTree,
    stringifyBigInts,
} from 'maci-crypto'
import { maxEpochKeyNonce, circuitEpochTreeDepth, circuitGlobalStateTreeDepth } from "../../config/testLocal"

describe('Verify Epoch Key circuits', function () {
    this.timeout(300000)

    let circuit

    let accounts: Signer[]
    let unirepContract: Contract
    let ZERO_VALUE

    const maxEPK = BigInt(2 ** circuitEpochTreeDepth)

    let id, commitment, stateRoot
    let tree, proof, root
    let nonce, currentEpoch, epochKey

    before(async () => {
        accounts = await ethers.getSigners()
    
        const _treeDepths = getTreeDepthsForTesting("circuit")
        unirepContract = await deployUnirep(<Wallet>accounts[0], _treeDepths)
        ZERO_VALUE = await unirepContract.hashedBlankStateLeaf()
        const startCompileTime = Math.floor(new Date().getTime() / 1000)
        circuit = await compileAndLoadCircuit('test/verifyEpochKey_test.circom')
        const endCompileTime = Math.floor(new Date().getTime() / 1000)
        console.log(`Compile time: ${endCompileTime - startCompileTime} seconds`)

        tree = new IncrementalQuinTree(circuitGlobalStateTreeDepth, ZERO_VALUE, 2)
        id = genIdentity()
        commitment = genIdentityCommitment(id)
        stateRoot = genRandomSalt()

        const hashedStateLeaf = await unirepContract.hashStateLeaf(
            [
                commitment.toString(),
                stateRoot.toString()
            ]
        )
        tree.insert(BigInt(hashedStateLeaf.toString()))
        proof = tree.genMerklePath(0)
        root = tree.root

        nonce = 0
        currentEpoch = 1
        epochKey = genEpochKey(id['identityNullifier'], currentEpoch, nonce, circuitEpochTreeDepth)
    })

    it('Valid epoch key should pass check', async () => {
        // Check if every valid nonce works
        for (let i = 0; i <= maxEpochKeyNonce; i++) {
            const n = i
            const epk = genEpochKey(id['identityNullifier'], currentEpoch, n, circuitEpochTreeDepth)
            const circuitInputs = {
                identity_pk: id['keypair']['pubKey'],
                identity_nullifier: id['identityNullifier'], 
                identity_trapdoor: id['identityTrapdoor'],
                user_state_root: stateRoot,
                path_elements: proof.pathElements,
                path_index: proof.indices,
                root: root,
                nonce: n,
                max_nonce: maxEpochKeyNonce,
                epoch: currentEpoch,
                epoch_key: epk,
            }
            const witness = await executeCircuit(circuit, circuitInputs)
            const startTime = Math.floor(new Date().getTime() / 1000)
            const results = await genVerifyEpochKeyProofAndPublicSignals(stringifyBigInts(circuitInputs), circuit)
            const endTime = Math.floor(new Date().getTime() / 1000)
            console.log(`Gen Proof time: ${endTime - startTime} ms (${Math.floor((endTime - startTime) / 1000)} s)`)
            const isValid = await verifyEPKProof(results['proof'], results['publicSignals'])
            expect(isValid).to.be.true
        }
    })

    it('Invalid epoch key should not pass check', async () => {
        // Validate against invalid epoch key
        const invalidEpochKey1 = maxEPK
        let circuitInputs = {
            identity_pk: id['keypair']['pubKey'],
            identity_nullifier: id['identityNullifier'], 
            identity_trapdoor: id['identityTrapdoor'],
            user_state_root: stateRoot,
            path_elements: proof.pathElements,
            path_index: proof.indices,
            root: root,
            nonce: nonce,
            max_nonce: maxEpochKeyNonce,
            epoch: currentEpoch,
            epoch_key: invalidEpochKey1,
        }
        let error
        try {
            await executeCircuit(circuit, circuitInputs)
        } catch (e) {
            error = e
            expect(true).to.be.true
        } finally {
            if (!error) throw Error("Epoch key too large should throw error")
        }
    })

    it('Wrong Id should not pass check', async () => {
        const fakeId = genIdentity()
        const circuitInputs = {
            identity_pk: fakeId['keypair']['pubKey'],
            identity_nullifier: fakeId['identityNullifier'], 
            identity_trapdoor: fakeId['identityTrapdoor'],
            user_state_root: stateRoot,
            path_elements: proof.pathElements,
            path_index: proof.indices,
            root: root,
            nonce: nonce,
            max_nonce: maxEpochKeyNonce,
            epoch: currentEpoch,
            epoch_key: epochKey,
        }
        let error
        try {
            await executeCircuit(circuit, circuitInputs)
        } catch (e) {
            error = e
            expect(true).to.be.true
        } finally {
            if (!error) throw Error("Wrong Id should throw error")
        }
    })

    it('Mismatched GST tree root should not pass check', async () => {
        const otherTreeRoot = genRandomSalt()
        const circuitInputs = {
            identity_pk: id['keypair']['pubKey'],
            identity_nullifier: id['identityNullifier'], 
            identity_trapdoor: id['identityTrapdoor'],
            user_state_root: stateRoot,
            path_elements: proof.pathElements,
            path_index: proof.indices,
            root: otherTreeRoot,
            nonce: nonce,
            max_nonce: maxEpochKeyNonce,
            epoch: currentEpoch,
            epoch_key: epochKey,
        }
        let error
        try {
            await executeCircuit(circuit, circuitInputs)
        } catch (e) {
            error = e
            expect(true).to.be.true
        } finally {
            if (!error) throw Error("Wrong GST Root should throw error")
        }
    })

    it('Invalid nonce should not pass check', async () => {
        const invalidNonce = maxEpochKeyNonce + 1
        const circuitInputs = {
            identity_pk: id['keypair']['pubKey'],
            identity_nullifier: id['identityNullifier'], 
            identity_trapdoor: id['identityTrapdoor'],
            user_state_root: stateRoot,
            path_elements: proof.pathElements,
            path_index: proof.indices,
            root: root,
            nonce: invalidNonce,
            max_nonce: maxEpochKeyNonce,
            epoch: currentEpoch,
            epoch_key: epochKey,
        }
        let error
        try {
            await executeCircuit(circuit, circuitInputs)
        } catch (e) {
            error = e
            expect(true).to.be.true
        } finally {
            if (!error) throw Error("Invalid nonce should throw error")
        }
    })

    it('Invalid epoch should not pass check', async () => {
        let invalidEpoch, invalidEpochKey
        invalidEpoch = currentEpoch + 1
        invalidEpochKey = genEpochKey(id['identityNullifier'], invalidEpoch, nonce, circuitEpochTreeDepth)
        while (invalidEpochKey == epochKey) {
            invalidEpoch += 1
            invalidEpochKey = genEpochKey(id['identityNullifier'], invalidEpoch, nonce, circuitEpochTreeDepth)
        }
        const circuitInputs = {
            identity_pk: id['keypair']['pubKey'],
            identity_nullifier: id['identityNullifier'], 
            identity_trapdoor: id['identityTrapdoor'],
            user_state_root: stateRoot,
            path_elements: proof.pathElements,
            path_index: proof.indices,
            root: root,
            nonce: nonce,
            max_nonce: maxEpochKeyNonce,
            epoch: invalidEpoch,
            epoch_key: epochKey,
        }
        let error
        try {
            await executeCircuit(circuit, circuitInputs)
        } catch (e) {
            error = e
            expect(true).to.be.true
        } finally {
            if (!error) throw Error("Wrong epoch should throw error")
        }
    })
})