import { SMT } from '@common'

describe('Spared Merkle Tree', () => {
    describe('Basic Operations', () => {
        it('should return default root for empty tree', () => {
            const smt = new SMT()
            const root = smt.getRoot()
            expect(root).toBeDefined()
            expect(root.length).toBe(64)
        })

        it('should change root after update', () => {
            const smt = new SMT()
            const rootBefore = smt.getRoot()
            smt.update('abc', Buffer.from('hello').toString('hex'))
            const rootAfter = smt.getRoot()
            expect(rootBefore).not.toBe(rootAfter)
        })

        it('should produce different roots for different values', () => {
            const smt1 = new SMT()
            const smt2 = new SMT()
            smt1.update('abc', Buffer.from('value1').toString('hex'))
            smt2.update('abc', Buffer.from('value2').toString('hex'))
            expect(smt1.getRoot()).not.toBe(smt2.getRoot())
        })

        it('should produce same root for same insertions regardless of order', () => {
            const smt1 = new SMT()
            const smt2 = new SMT()
            smt1.update('aaa', Buffer.from('v1').toString('hex'))
            smt1.update('bbb', Buffer.from('v2').toString('hex'))
            smt2.update('bbb', Buffer.from('v2').toString('hex'))
            smt2.update('aaa', Buffer.from('v1').toString('hex'))
            expect(smt1.getRoot()).toBe(smt2.getRoot())
        })
    })

    describe('Proof Generation & Verification', () => {
        it('should generate proof of length 256', () => {
            const smt = new SMT()
            smt.update('abc', Buffer.from('hello').toString('hex'))
            const proof = smt.prove('abc')
            expect(proof.length).toBe(256)
        })

        it('should verify valid inclusion proof', () => {
            const smt = new SMT()
            const key = 'deadbeef'
            const value = Buffer.from('test_value_123').toString('hex')
            smt.update(key, value)
            const root = smt.getRoot()
            const proof = smt.prove(key)
            expect(smt.verify(key, value, proof, root)).toBe(true)
        })

        it('should reject proof with wrong value', () => {
            const smt = new SMT()
            const key = 'deadbeef'
            smt.update(key, Buffer.from('correct').toString('hex'))
            const root = smt.getRoot()
            const proof = smt.prove(key)
            expect(
                smt.verify(
                    key,
                    Buffer.from('wrong').toString('hex'),
                    proof,
                    root
                )
            ).toBe(false)
        })

        it('should reject proof with wrong root', () => {
            const smt = new SMT()
            smt.update('abc', Buffer.from('value').toString('hex'))
            const proof = smt.prove('abc')
            const fakeRoot = '0x' + 'ff'.repeat(32)
            expect(
                smt.verify(
                    'abc',
                    Buffer.from('value').toString('hex'),
                    proof,
                    fakeRoot
                )
            ).toBe(false)
        })

        it('should handle multiple entries and prove each correctly', () => {
            const smt = new SMT()
            const entries: [string, string][] = [
                ['aabbcc', Buffer.from('balance_100').toString('hex')],
                ['ddeeff', Buffer.from('balance_200').toString('hex')],
                ['112233', Buffer.from('balance_50').toString('hex')],
            ]

            for (const [k, v] of entries) smt.update(k, v)
            const root = smt.getRoot()

            for (const [k, v] of entries) {
                const proof = smt.prove(k)
                expect(smt.verify(k, v, proof, root)).toBe(true)
            }
        })
    })
})
