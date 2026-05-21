type Point = { x: string; y: string }

type Ecies = {
    iv: string
    ephemPublicKey: string
    ciphertext: string
    mac: string
}
type Signature = { r: string; s: string }

type PaillierPublicKey = { n: string; g: string }
type PaillierPrivateKey = { lambda: string; mu: string }
type Paillier = { publicKey: PaillierPublicKey; privateKey: PaillierPrivateKey }

type TxPayload = {
    chainId: string
    userId: string
    amount: string
}
