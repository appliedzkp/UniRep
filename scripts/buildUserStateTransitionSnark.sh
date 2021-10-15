#!/bin/bash

set -e

cd "$(dirname "$0")"
cd ..
mkdir -p build

NODE_OPTIONS=--max-old-space-size=8192 npx ts-node scripts/buildSnarks.ts -i circuits/test/startTransition_test.circom -j build/startTransitionCircuit.r1cs -w build/startTransition.wasm -y build/startTransition.sym -pt build/powersOfTau28_hez_final_17.ptau -zk build/startTransition.zkey -vk build/startTransition.vkey.json -s build/StartTransitionVerifier.sol -vs StartTransitionVerifier -cn startTransition

echo 'Copying StartTransitionVerifier.sol to contracts/'
cp ./build/StartTransitionVerifier.sol ./contracts/

NODE_OPTIONS=--max-old-space-size=8192 npx ts-node scripts/buildSnarks.ts -i circuits/test/processAttestations_test.circom -j build/processAttestationsCircuit.r1cs -w build/processAttestations.wasm -y build/processAttestations.sym -pt build/powersOfTau28_hez_final_17.ptau -zk build/processAttestations.zkey -vk build/processAttestations.vkey.json -s build/ProcessAttestationsVerifier.sol -vs ProcessAttestationsVerifier -cn processAttestations

echo 'Copying ProcessAttestationsVerifier.sol to contracts/'
cp ./build/ProcessAttestationsVerifier.sol ./contracts/

NODE_OPTIONS=--max-old-space-size=8192 npx ts-node scripts/buildSnarks.ts -i circuits/test/userStateTransition_test.circom -j build/userStateTransitionCircuit.r1cs -w build/userStateTransition.wasm -y build/userStateTransition.sym -pt build/powersOfTau28_hez_final_17.ptau -zk build/userStateTransition.zkey -vk build/userStateTransition.vkey.json -s build/UserStateTransitionVerifier.sol -vs UserStateTransitionVerifier -cn userStateTransition

echo 'Copying UserStateTransitionVerifier.sol to contracts/'
cp ./build/UserStateTransitionVerifier.sol ./contracts/
