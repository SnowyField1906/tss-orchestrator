import * as dotenv from 'dotenv'

const isProduction = process.env.NODE_ENV === 'production'
dotenv.config({ path: isProduction ? '.env' : '.env.local' })

export default () => ({
    host: process.env.HOST,
    port: process.env.PORT,
    mongoUri: process.env.MONGO_URI,
    threshold: process.env.THRESHOLD,
    size: process.env.SIZE,
    nodes: Array.from({ length: Number(process.env.SIZE) }, (_, i) => ({
        id: i + 1,
        url: process.env[`NODE_${i + 1}_URL`],
    })),
})
