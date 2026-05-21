_This is a part of my Bachelor's thesis. [Nguyen Huu Thuan](mailto:snowyfield1906@gmail.com), [University of Science - VNUHCM](https://en.hcmus.edu.vn/) (2026)._

- [tss-node](https://github.com/SnowyField1906/tss-node)
- tss-orchestrator (current)
- [tss-node-p2p](https://github.com/SnowyField1906/tss-node-p2p)

# Thesis Abstraction

## Design objectives

1. **Verifiability**: Any _falsified/corrupted information_ a node receives from the Orchestrator server or other peer nodes can be _independently verified_. However, this comes at the cost of not guaranteeing the availability of the service if the Orchestrator server intentionally delays or provides falsified/corrupted information.

2. **Byzantine fault tolerance**: The network is fault-tolerant up to a threshold of $t$ such that $n/2 < t \leq n$. In the most extreme case where an attacker simultaneously controls both the Orchestrator server and $t - 1$ nodes, the system must still ensure cryptographic safety, meaning it is impossible to generate a valid signature pair for any state that is fraudulent or affects the state of the remaining $t$ honest nodes.

3. **Commitment of the signature**: A transaction once signed must be _atomic and committed_. Even when $\geq t$ nodes go offline simultaneously, any transaction that has been signed and confirmed in the past can still be _unilaterally settled on-chain_ by anyone without causing a conflict or exposing a vulnerability that would freeze latest valid state by any kind of attacks.

## Optimization strategies

1. **Optimizing input throughput**: Instead of signing directly on each individual transaction, the system signs indirectly on the cumulative state of the entire fund. This strategy allows an unlimited number of micro-transactions to be aggregated off-chain into a single settlement message, maximizing throughput and reducing transaction fees to near-zero.

2. **Optimizing output throughput**: Instead of performing direct transfers at each settlement, the Smart Contract adopts a proactive pull-model.

3. **Optimizing data structure and blockchain costs**: Instead of having Smart Contract to update the cumulative state for each user at each settlement, the system uses a Sparse Merkle Tree approach. This strategy allows the Smart Contract to perform only a fixed $O(1)$ complexity of Merkle Root reassignment (settlement) and proof verification (fund withdrawal). Additionally, the Merkle root is optimized to just a fixed-size `32-bytes` value by precomputing the values of empty branches for all $2^{256}$ states.

4. **Optimizing consensus process and native multi-chain support**: Instead of having on-chain threshold consensus, the system moves the consensus process to an off-chain network by utilizing mathematical properties to constrain the ability to generate threshold signatures. Additionally, the off-chain consensus process naturally enables native multi-chain support.

5. **Optimizing cryptographic security**: Instead of using only a single **Feldman Verifiable Secret Sharing** phase for the Distributed Key Generation, the system adds **Pedersen Verifiable Secret Sharing** to address the waiting attack vulnerability and employs **Threshold Signature Scheme** to ensure that the fund's private key exists only mathematically but is never reconstructed anywhere in memory.

6. **Optimizing network complexity**:  Instead of using a fully distributed architecture with communication complexity of $O(n^2)$ and $O(t^2)$, the system employs a central Orchestrator server to aggregate messages, reducing complexity to linear $O(n)$ and $O(t)$ without compromising cryptographic security.

7. **Optimizing transaction finality**: Instead of having a lock-time to handle the latest state dispute, the system relies on cumulative state and one-way transaction properties to eliminate the possibility of forking or state dispute.

# TSS Orchestrator

This repository contains the implementation of the off-chain matchmaker $\mathcal{O}$ for the **Threshold Signature Scheme (TSS)** network.

The Orchestrator acts as a trustless, verifiable router and matchmaker for the participant nodes $\mathcal{P}_i$. It reduces the network communication complexity of multiparty computation protocols from $O(n^2)$ to $O(n)$ and minimizes the database storage requirements for participant nodes.

## Distributed Key Generation (DKG) Routing

The Orchestrator coordinates a $(t, n)$ Threshold Pedersen Verifiable Secret Sharing (PVSS) scheme to establish a joint public key on the `secp256k1` curve. It centralizes peer-to-peer message transmission to simplify routing.

- **Initialization (`POST /dkg/initialize`)**

    Initiates the process by calling `POST /dkg/broadcast` on all nodes. It collects their Paillier public keys, vectors of Pedersen Commitments $C_{i,k} = f_{i,k}G + g_{i,k}H$, and the encrypted secret shares $(s_{i,j}, t_{i,j})$.

- **Encrypted segment routing**

    The Orchestrator routes the encrypted shares to their respective target nodes $j$ via a single batch request (`POST /dkg/receive`), along with the sender's validation commitments. Each node $i$ is responsible for decrypting and verifying all $n - 1$ secret and noise shares intended for it by the corresponding Pedersen Commitments. Then returns the Feldman Commitments $A_{i,k} = a_{i,k}G$.

- **Master key reconstruction**

    Calls `POST /dkg/compute-public-key` on all nodes. It distributes all Feldman Commitments to all nodes. By performing Elliptic Curve point addition on the primary coefficients ($A_{i,0}$), the nodes reconstruct and verify the uncompressed Global Public Key: $Y = \sum_{i=1}^n A_{i,0}$

## Threshold Signature Scheme (TSS) Matchmaking

The Orchestrator coordinates the 4-phase interactive GG18 signing pipeline for a selected subset $S \subset \{\mathcal{P}_1, \dots, \mathcal{P}_n\}$ where $|S| = t$. It ensures consensus for transaction proposals and handles state synchronization.

- **Asynchronous Proposal Pooling (`POST /tss/propose`)**

    Nodes autonomously submit state update proposals containing the transaction payload (`chainId`, `userId`, `amountHex`) and a deterministic message digest:
    $$\text{messageHash} = \text{sha256}(\text{chainId} \parallel \text{newNonce} \parallel \text{newRoot})$$
    The Orchestrator groups these proposals by `messageHash` in a database polling map, handling potential node overrides.

- **Threshold Triggering & Execution**

    Once the voting subset reaches the threshold $t$, the Orchestrator locks the execution state for that `messageHash` and clears the proposal. It discards subsequent duplicate votes and starts an isolated TSS signing session for the matched $t$-node subset.

- **Phase Coordination & Mathematical Extraction**

  - **Phase 1: Start**

    Sends concurrent requests to `/tss/start` across the subset. It accumulates the public ephemeral curve points $\Gamma_i = \gamma_i G$ and the homomorphically encrypted random scalars $E_i(k_i)$ and $E_i(w_i)$.

  - **Phase 2: Multiplicative-to-Additive**

    For every node $i$, it bundles the Paillier ciphertexts of all other subset members $j \neq i$ and routes them to node $i$'s `/tss/mta` endpoint. It intercepts the returning ciphertext matrix containing homomorphically blinded shares ($\alpha, \nu$).

  - **Phase 3: Delta & Sigma**

    Routes the blinded shares ($\alpha_{ji}, \nu_{ji}$) back to the recipient node $i$ via `/tss/delta` and collects the local decrypted scalar values $\delta_i$. The Orchestrator computes the global scalar $\delta = \sum_{i \in S} \delta_i \pmod q$ and performs an EC scalar multiplication to resolve the global signature point:
    $$R = \delta^{-1} \sum_{i \in S} \Gamma_i = \left( \sum_{i \in S} k_i \right)^{-1} G$$
    The $x$-coordinate of point $R$ is extracted modulo $q$ to derive the ECDSA $r$ value.

  - **Phase 4: Signature Aggregation**

    Dispatches the scalar $r$ to `/tss/sign` for all nodes in the subset, collects the local signature components $s_i = m \cdot k_i + r \cdot \sigma_i \pmod q$, and computes the global signature scalar $s = \sum_{i \in S} s_i \pmod q$.

## Sparse Merkle Tree (SMT) Fund Management

The Orchestrator maintains the off-chain balance state using a fixed-depth ($d=256$) Sparse Merkle Tree structure.

- **Binary Operations**

    To ensure gas-efficient on-chain verification, the SMT algorithm uses raw binary block operations instead of string-based hex conversions. Leaves are generated by padding the 20-byte `userId` and 32-byte `balance` into a unified 52-byte buffer. Intermediate parent hashes are resolved using standard binary buffer concatenation:
    $$\text{parentHash} = \text{keccak256}(\text{Buffer.concat}([\text{leftBuf}, \text{rightBuf}]))$$

- **Parallel Multi-Chain State Isolation**

    The system supports multi-chain isolation. Database persistence uses atomic sub-document updates rather than document-wide overwrites to prevent race conditions during concurrent multi-chain traffic.

- **Ledger Commitments**

    Upon receiving a successful threshold signature from the TSS session, the Orchestrator updates the user's mapping in the `Fund` document. It mutates the SMT, increments the `nonce` counter, and binds the $\{r, s\}$ signature to the current state root.

- **Disbursement Proof Generation**

    Generates an $O(\log n)$ path vector containing 256 structural sibling hashes. This inclusion proof is packaged with the cumulative token balance, allowing users to submit an on-chain `claim()` execution autonomously.

## Database Schema (MongoDB)

### `Fund`

Represents the cumulative executed state for specific blockchain networks.

- `chainId`: The globally unique blockchain identifier (e.g., `mainnet_1`).
- `nonce`: Sequential integer counter tracking successful settlement occurrences on this chain.
- `root`: 64-character hex string representing the absolute root of the Sparse Merkle Tree.
- `signature`: The active $\{ r, s \}$ ECDSA threshold signature backing the current root.
- `balances`: Granular mapping of `userId` (40-char hex) to cumulative token balances in hexadecimal.

### `Proposal`

Ephemeral storage acting as a concurrent voting mempool for incoming multi-node proposals.

- `messageHash`: The cryptographic identifier of the proposed state.
- `chainId`: The target blockchain for this proposal.
- `payload`: The transaction details `{ chainId, userId, amount }`.
- `proposers`: An array of `nodeId`s that have submitted an identical proposal for this `messageHash`. When its size reaches $t$, a TSS session is triggered.

## Directory Structure (NestJS)

- [`common/`](./common/)
  - [`bignumber.ts`](./common/bignumber.ts)
  - [`ecies.ts`](./common/ecies.ts)
  - [`hashes.ts`](./common/hashes.ts)
  - [`secp256k1.ts`](./common/secp256k1.ts)
  - [`smt.ts`](./common/smt.ts)
- [`config/`](./config/)
  - [`index.ts`](./config/index.ts)
- [`controllers/`](./controllers/)
  - [`dkg.controller.ts`](./controllers/dkg.controller.ts)
  - [`fund.controller.ts`](./controllers/fund.controller.ts)
  - [`ping.controller.ts`](./controllers/ping.controller.ts)
  - [`tss.controller.ts`](./controllers/tss.controller.ts)
- [`dtos/`](./dtos/)
  - [`dkg.dto.ts`](./dtos/dkg.dto.ts)
  - [`fund.dto.ts`](./dtos/fund.dto.ts)
  - [`tss.dto.ts`](./dtos/tss.dto.ts)
- [`helpers/`](./helpers/)
  - [`httpRequest.ts`](./helpers/httpRequest.ts)
- [`schemas/`](./schemas/)
  - [`fund.schema.ts`](./schemas/fund.schema.ts)
  - [`proposal.schema.ts`](./schemas/proposal.schema.ts)
- [`services/`](./services/)
  - [`dkg.service.ts`](./services/dkg.service.ts)
  - [`fund.service.ts`](./services/fund.service.ts)
  - [`ping.service.ts`](./services/ping.service.ts)
  - [`tss.service.ts`](./services/tss.service.ts)
- [`test/`](./test/)
  - [`fund.spec.ts`](./test/fund.spec.ts)
  - [`smt.spec.ts`](./test/smt.spec.ts)
- [`types/`](./types/)
  - [`global.d.ts`](./types/global.d.ts)

## Test Suite (Jest)

- **Spared Merkle Tree**
  - Basic Operations
    - [x] `should return default root for empty tree` (13 ms)
    - [x] `should change root after update` (4 ms)
    - [x] `should produce different roots for different values` (11 ms)
    - [x] `should produce same root for same insertions regardless of order` (10 ms)
  - Proof Generation & Verification
    - [x] `should generate proof of length 256` (4 ms)
    - [x] `should verify valid inclusion proof` (3 ms)
    - [x] `should reject proof with wrong value` (6 ms)
    - [x] `should reject proof with wrong root` (4 ms)
    - [x] `should handle multiple entries and prove each correctly` (8 ms)

- **Orchestrator FundService (Matchmaker Architecture)**
  - [x] `Phase 1.1: getLatestState returns empty and valid fallback state for a new chain` (12 ms)
  - [x] `Phase 1.2: getSettlementData returns null gracefully if chain does not exist` (1 ms)
  - [x] `Phase 2.1: commitTransaction processes successful TSS Match for User A` (6 ms)
  - [x] `Phase 2.2: getSettlementData formats EVM-ready signature correctly` (2 ms)
  - [x] `Phase 3.1: commitTransaction processes sequential TSS Match for a NEW User B` (7 ms)
  - [x] `Phase 3.2: getMerkleProof returns valid proofs for all active users` (13 ms)
  - [x] `Phase 4.1: getMerkleProof handles unregistered user without throwing errors` (3 ms)

## Benchmark

These are end-to-end benchmark results ran locally with their corresponding numbers of ports and Mongo DBs.

Macbook M1 Pro 2021, 16GB RAM, 10-core CPU.

### Star topology network

This is the result when running benchmark on [@SnowyField1906/tss-node](https://github.com/SnowyField1906/tss-node) (proposed architecture).

![End-to-End Transaction Time](https://raw.githubusercontent.com/SnowyField1906/tss-node/refs/heads/main/benchmark/txs-plot.png)
![Distributed Key Generation Time](https://raw.githubusercontent.com/SnowyField1906/tss-node/refs/heads/main/benchmark/dkg-plot.png)

### Mesh topology network

This is the result when running benchmark on [@SnowyField1906/tss-node-p2p](https://github.com/SnowyField1906/tss-node-p2p) (alternative architecture).

![End-to-End Transaction Time](https://raw.githubusercontent.com/SnowyField1906/tss-node-p2p/refs/heads/main/benchmark/txs-plot.png)
![Distributed Key Generation Time](https://raw.githubusercontent.com/SnowyField1906/tss-node-p2p/refs/heads/main/benchmark/dkg-plot.png)

## Setup & Execution

### Environment variables

```
HOST=127.0.0.1
PORT=4000
MONGO_URI=mongodb://127.0.0.1:27017/orchestrator
SIZE=3
THRESHOLD=2
NODE_1_URL=http://127.0.0.1:3001
NODE_2_URL=http://127.0.0.1:3002
NODE_3_URL=http://127.0.0.1:3003
```

### Install dependencies

```bash
yarn
```

### Unit testing

```bash
yarn test # smt.spec.ts fund.spec.ts
```

### Start

```bash
yarn start:dev
```
