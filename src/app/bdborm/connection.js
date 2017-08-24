import * as driver from 'bigchaindb-driver' // eslint-disable-line import/no-namespace


export default class Connection {
    constructor(path, headers = {}) {
        this.path = path
        this.headers = Object.assign({}, headers)
        this.conn = new driver.Connection(path, headers)
    }

    getAssetId(tx){
        return tx.operation === 'CREATE' ? tx.id : tx.asset.id
    }

    getTransaction(transactionId) {
        return this.conn.getTransaction(transactionId)
    }

    listTransactions(assetId, operation) {
        return this.conn.listTransactions(assetId, operation)
    }

    listOutputs(publicKey, spent) {
        return this.conn.listOutputs(publicKey, spent)
    }

    getBlock(blockId) {
        return this.conn.getBlock(blockId)
    }

    listBlocks(transactionId) {
        return this.conn.listBlocks(transactionId)
            .then(blockIds => Promise.all(
                blockIds.map(blockId => this.conn.getBlock(blockId))
            ))
    }

    listVotes(blockId) {
        return this.conn.listVotes(blockId)
    }

    searchAssets(text) {
        return this.conn.searchAssets(text)
            .then(assetList => Promise.all(
                assetList.map(asset => this.conn.getTransaction(asset.id))
            ))
    }

    createTransaction(publicKey, privateKey, payload, metadata) {
        // Create a transation
        const tx = driver.Transaction.makeCreateTransaction(
            payload,
            metadata,
            [
                driver.Transaction.makeOutput(
                    driver.Transaction.makeEd25519Condition(publicKey))
            ],
            publicKey
        )

        // sign/fulfill the transaction
        const txSigned = driver.Transaction.signTransaction(tx, privateKey)

        // send it off to BigchainDB
        return this.conn.postTransaction(txSigned)
            .then(() => this.conn.pollStatusAndFetchTransaction(txSigned.id))
            .then(() => txSigned)
    }

    transferTransaction(tx, fromPublicKey, fromPrivateKey, toPublicKey, metadata) {
        const txTransfer = driver.Transaction.makeTransferTransaction(
            tx,
            metadata,
            [
                driver.Transaction.makeOutput(
                    driver.Transaction.makeEd25519Condition(toPublicKey)
                )
            ],
            0
        )

        const txTransferSigned = driver.Transaction.signTransaction(txTransfer, fromPrivateKey)
        // send it off to BigchainDB
        return this.conn.postTransaction(txTransferSigned)
            .then(() =>
                this.conn.pollStatusAndFetchTransaction(txTransferSigned.id))
            .then(() => txTransferSigned)
    }

    getSortedTransactions(assetId) {
        return this.conn.listTransactions(assetId)
            .then((txList) => {
                if (txList.length <= 1) {
                    return txList
                }
                const inputTransactions = []
                txList.forEach((tx) =>
                    tx.inputs.forEach(input => {
                        if (input.fulfills) {
                            inputTransactions.push(input.fulfills.transaction_id)
                        }
                    })
                )
                const unspents = txList.filter((tx) => inputTransactions.indexOf(tx.id) === -1)
                if (unspents.length) {
                    let tipTransaction = unspents[0]
                    let tipTransactionId = tipTransaction.inputs[0].fulfills.transaction_id
                    const sortedTxList = []
                    while (true) { // eslint-disable-line no-constant-condition
                        sortedTxList.push(tipTransaction)
                        try {
                            tipTransactionId = tipTransaction.inputs[0].fulfills.transaction_id
                        } catch (e) {
                            break
                        }
                        if (!tipTransactionId) {
                            break
                        }
                        tipTransaction = txList.filter((tx) => // eslint-disable-line no-loop-func
                            tx.id === tipTransactionId)[0]
                    }
                    return sortedTxList.reverse()
                } else {
                    console.error('something went wrong while sorting transactions',
                        txList, inputTransactions)
                }
                return txList
            })
    }

}