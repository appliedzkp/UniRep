import * as fs from 'fs'
import assert from 'assert'
import lineByLine from 'n-readlines'
import * as path from 'path'
import { SnarkProof } from 'libsemaphore'
const circom = require('circom')
const snarkjs = require('snarkjs')
import * as shell from 'shelljs'

import {
    stringifyBigInts,
    unstringifyBigInts,
} from 'maci-crypto'

const zkutilPath = "~/.cargo/bin/zkutil"

/*
 * @param circuitPath The subpath to the circuit file (e.g.
 *     test/userStateTransition_test.circom)
 */
const compileAndLoadCircuit = async (
    circuitPath: string
) => {
    const circuit = await circom.tester(path.join(
        __dirname,
        `../../circuits/${circuitPath}`,
    ))

    await circuit.loadSymbols()

    return circuit
}

const executeCircuit = async (
    circuit: any,
    inputs: any,
) => {

    const witness = await circuit.calculateWitness(inputs, true)
    await circuit.checkConstraints(witness)
    await circuit.loadSymbols()

    return witness
}

const getSignalByName = (
    circuit: any,
    witness: any,
    signal: string,
) => {

    return witness[circuit.symbols[signal].varIdx]
}

const getSignalByNameViaSym = (
    circuitName: any,
    witness: any,
    signal: string,
) => {
    const symPath = path.join(__dirname, '../../build/', `${circuitName}.sym`)
    const liner = new lineByLine(symPath)
    let line
    let index
    let found = false

    while (true) {
        line = liner.next()
        debugger
        if (!line) { break }
        const s = line.toString().split(',')
        if (signal === s[3]) {
            index = s[1]
            found = true
            break
        }
    }

    assert(found)

    return witness[index]
}

const genProofAndPublicSignals = async (
    circuitName: string,
    inputs: any,
    compileCircuit = true,
) => {
    const date = Date.now()
    const paramsPath = path.join(__dirname, '../../build/', `${circuitName}.params`)
    const circuitR1csPath = path.join(__dirname, '../../build/', `${circuitName}Circuit.r1cs`)
    const circuitWasmPath = path.join(__dirname, '../../build/', `${circuitName}.wasm`)
    const inputJsonPath = path.join(__dirname, '../../build/' + date + '.input.json')
    const witnessPath = path.join(__dirname, '../../build/' + date + '.witness.wtns')
    const witnessJsonPath = path.join(__dirname, '../../build/' + date + '.witness.json')
    const proofPath = path.join(__dirname, '../../build/' + date + '.proof.json')
    const publicJsonPath = path.join(__dirname, '../../build/' + date + '.publicSignals.json')

    fs.writeFileSync(inputJsonPath, JSON.stringify(stringifyBigInts(inputs)))

    let circuit
     if (compileCircuit) {	
         circuit = await compileAndLoadCircuit(`/test/${circuitName}_test.circom`)	
     }

    const snarkjsCmd = 'node ' + path.join(__dirname, '../../node_modules/snarkjs/build/cli.cjs')
    const witnessCmd = `${snarkjsCmd} wc ${circuitWasmPath} ${inputJsonPath} ${witnessPath}`

    shell.exec(witnessCmd)

    const witnessJsonCmd = `${snarkjsCmd} wej ${witnessPath} ${witnessJsonPath}`
    shell.exec(witnessJsonCmd)

    const proveCmd = `${zkutilPath} prove -c ${circuitR1csPath} -p ${paramsPath} -w ${witnessJsonPath} -r ${proofPath} -o ${publicJsonPath}`

    shell.exec(proveCmd)

    const witness = unstringifyBigInts(JSON.parse(fs.readFileSync(witnessJsonPath).toString()))
    const publicSignals = unstringifyBigInts(JSON.parse(fs.readFileSync(publicJsonPath).toString()))
    const proof = JSON.parse(fs.readFileSync(proofPath).toString())

    shell.rm('-f', witnessPath)
    shell.rm('-f', witnessJsonPath)
    shell.rm('-f', proofPath)
    shell.rm('-f', publicJsonPath)
    shell.rm('-f', inputJsonPath)

    return { circuit, proof, publicSignals, witness }
}

const verifyProof = async (
    circuitName: string,
    proof: any,
    publicSignals: any,
): Promise<boolean> => {

    const date = Date.now().toString()
    const proofFilename = `${date}.${circuitName}.proof.json`
    const publicSignalsFilename = `${date}.${circuitName}.publicSignals.json`

    fs.writeFileSync(
        path.join(__dirname, '../../build/', proofFilename),
        JSON.stringify(
            stringifyBigInts(proof)
        )
    )

    fs.writeFileSync(
        path.join(__dirname, '../../build/', publicSignalsFilename),
        JSON.stringify(
            stringifyBigInts(publicSignals)
        )
    )

    const paramsPath = path.join(__dirname, '../../build/', `${circuitName}.params`)
    const proofPath = path.join(__dirname, '../../build/', proofFilename)
    const publicSignalsPath = path.join(__dirname, '../../build/', publicSignalsFilename)

    const verifyCmd = `${zkutilPath} verify -p ${paramsPath} -r ${proofPath} -i ${publicSignalsPath}`
    const output = shell.exec(verifyCmd).stdout.trim()

    shell.rm('-f', proofPath)
    shell.rm('-f', publicSignalsPath)

    return output === 'Proof is correct'
}

const formatProofForVerifierContract = (
    _proof: SnarkProof,
) => {

    return ([
        _proof.pi_a[0],
        _proof.pi_a[1],
        _proof.pi_b[0][1],
        _proof.pi_b[0][0],
        _proof.pi_b[1][1],
        _proof.pi_b[1][0],
        _proof.pi_c[0],
        _proof.pi_c[1],
    ]).map((x) => x.toString())
}

export {
    compileAndLoadCircuit,
    executeCircuit,
    formatProofForVerifierContract,
    getSignalByName,
    getSignalByNameViaSym,
    genProofAndPublicSignals,
    verifyProof,
}