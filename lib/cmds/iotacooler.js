//custom iotacooler module
'use strict'

const fs = require('fs')
const assert = require('assert')
const read = require('read')
const smidgen = require('../smidgen.js')
const getSeed = require('../get-seed.js')

const cmds = {
  'get-addresses': getAddresses,
  'is-address-spent': isAddressSpent,
  'recover-funds-sign': recoverFundsSign,
  'recover-funds-send': recoverFundsSend,
  'get-adddress-transfers': getAddressTransfers
}

module.exports = (exports = cmds)

const usage = `Usage:
smidgen iotacooler get-addresses <start index> <end index>
smidgen iotacooler is-address-spent <address>
smidgen iotacooler recover-funds-sign <index> <receiving address> <full balance>
smidgen iotacooler recover-funds-send <receiving address> <signed bundle as trytes>
smidgen iotacooler get-address-transfers <address>

Note:
These commands are used internally by iotacooler, do not use manually!`

const shortUsage = usage

exports.cli = cli
exports.cli.usage = shortUsage

function cli ([ command, ...args ], cb) {
  let startIndex, endIndex, address, index, amount, tryteBundle
  switch (command) {
    case 'get-addresses':
    [ startIndex, endIndex ] = args
    getAddresses(smidgen.iota, startIndex, endIndex, cb)
    break
    case 'is-address-spent':
    address = args
    isAddressSpent(smidgen.iota, address, cb)
    break

    case 'recover-funds-sign':
    [ index, address, amount ] = args
    recoverFundsSign(smidgen.iota, index, address, amount, cb)
    break

    case 'recover-funds-send':
    [ address, tryteBundle ] = args
    recoverFundsSend(smidgen.iota, address, tryteBundle, cb)
    break

    case 'get-address-transfers':
    [ address ] = args
    getAddressTransfers(smidgen.iota, address, cb)
    break

    default:
    const err = new Error(usage)
    err.type = 'EUSAGE'
    cb(err)
    break
  }
}

function getAddresses (iota, startIndex, endIndex, cb) {
  let onlineSeed, offlineSeed

  getDoubleSeed((err, seeds) => { //online seed
    if (err) return cb(err)

    onlineSeed = seeds.split(':')[0]
    offlineSeed = seeds.split(':')[1]
    continueWithSeeds()
  })

  function continueWithSeeds() {
    let addressesArray = [ ]

    //FIXME
    let sIndex = Number(startIndex)
    let eIndex = Number(endIndex)
    assert.ok(
      ((sIndex >= 0) && (sIndex <= eIndex)),
      'Index args wrong!'
    )

    console.log(`Generating addresses from index ${startIndex} to index ${endIndex};`)
    for (let i = sIndex; i <= eIndex; i++) {
      let digestOnline = iota.multisig.getDigest(onlineSeed, i, 2) //default security level is 2
      let digestOffline = iota.multisig.getDigest(offlineSeed, i, 2)

      let address = new iota.multisig.address()
      .absorb(digestOffline) //order is always offline then online
      .absorb(digestOnline)
      .finalize()

      if (address.length === 81) {
        address = iota.utils.addChecksum(address)
      }
      addressesArray.push(address)
      console.log(`Done:${i}-${endIndex}:${address};`)
    }
    cb(null)
  }
}

function isAddressSpent (iota, address, cb) {
  assert.ok(
    (address.length > 0),
    'Address argument missing!'
  )
  //check also pre snapshot for address reuse
  iota.api.wereAddressesSpentFrom(address, (err, wereSpent) => {
    if (err) return cb(err)
    console.log(`AddressSpent:${wereSpent[0]}:${address}:`)
    cb(null)
  })
}

function recoverFundsSign (iota, index, receivingAddr, amount, cb) {
  //check inputs
  index = Number(index)
  amount = Number(amount)
  assert.ok(
    (index >= 0) && Number.isInteger(amount) && (amount > 0),
    'Invalid index or amount')

  assert.ok(
    (iota.valid.isAddress(receivingAddr) && iota.utils.isValidChecksum(receivingAddr)),
    'Invalid address'
  )

  let onlineSeed, offlineSeed

  getDoubleSeed((err, seeds) => { //online seed
    if (err) return cb(err)

    onlineSeed = seeds.split(':')[0]
    offlineSeed = seeds.split(':')[1]
    continueWithSeeds()
  })

  function continueWithSeeds() {
    //get spending address
    let digestOnline = iota.multisig.getDigest(onlineSeed, index, 2) //default security level is 2
    let digestOffline = iota.multisig.getDigest(offlineSeed, index, 2)

    let address = new iota.multisig.address()
    .absorb(digestOffline) //order is always offline then online
    .absorb(digestOnline)
    .finalize()

    let multisigTransfer = [
      {
        'address': iota.utils.noChecksum(receivingAddr),
        'value': amount,
        'message': '',
        'tag': '9'.repeat(27)
      }
    ];

    let input = {
      'address': address,
      'securitySum': 4,
      'balance': amount
    }

    let remainderAddress = iota.utils.noChecksum(receivingAddr)

    iota.multisig.initiateTransfer(input, remainderAddress, multisigTransfer, function(e, initiatedBundle) {
      if (e) {
        console.log(e)
        return
      }
      iota.multisig.addSignature(initiatedBundle, address,
                                 iota.multisig.getKey(offlineSeed, index, 2), function(e, firstSignedBundle) {
          if (e) {
            console.log(e)
            return
          }

          iota.multisig.addSignature(firstSignedBundle, address,
                                     iota.multisig.getKey(onlineSeed, index, 2), function(e, finalBundle) {
            if (!e) {
              if (iota.utils.validateSignatures(finalBundle, address)) {
                const tryteBundle = finalBundle.map((tr) => {
                  return iota.utils.transactionTrytes(tr)
                }).reverse()
                console.log('SignValid:true:', tryteBundle)
              } else {
                console.log('SignValid:false:')
              }
            } else {
              console.log('e is true error occurred')
              console.log(e)
            }
          })
      })
    })
    cb(null)
  }
}

function recoverFundsSend (iota, receivingAddr, tryteBundle, cb) {
  assert.ok(
    (receivingAddr.length > 0),
    'Address argument missing!'
  )
  assert.ok(tryteBundle, 'No bundle data provided')
  tryteBundle = JSON.parse(tryteBundle.replace(/'/g, '"')) //replace single with double quotes

  //make sure receiving address was not already spent from
  iota.api.wereAddressesSpentFrom(receivingAddr, (err, wereSpent) => {
    if (err) return cb(err)
    if (wereSpent[0]) {
      smidgen.log.error(`Address ${receivingAddr} was already used for spending!`)
    } else {
      smidgen.log.info('', 'Sending transaction...')

      let opts = smidgen.config
      iota.api.sendTrytes(tryteBundle, opts.depth, opts.mwm, (err, transaction) => {
        if (err) return cb(err)

        const hash = transaction[0].hash
        smidgen.log.info('', `Transaction sent, hash: ${hash}`)
        smidgen.log.info('', `Reattach with \`smidgen reattach ${hash}\``)
      })
    }
    cb(null)
  })
}

function getAddressTransfers (iota, address, cb) {
  assert.ok(
    (address.length > 0),
    'Address argument missing!'
  )

  iota.api.findTransactionObjects({ addresses: [ address ] }, (err, data) => {
    if (err) return cb(err)
    console.log(`Transfers:${address}:`, data)
    cb(null)
  })
}

function getDoubleSeed (cb) {
  read({ prompt: 'Enter your iotacooler seeds, separated by colon.\nonlineSeed:offlineSeed :',
  silent: true }, (err, seed) => {
    if (err) return err

    if (!seed.length) {
      const err = new Error([
        'Seems you pressed "Enter" without copy & pasting your seed.',
        '',
        'Did you copy & paste the seed into the terminal?'
      ].join('\n'))
      err.type = 'EUSAGE'
      return cb(err)
    }

    if (seed.length < 163) {
      const err = new Error([
        'Seeds must be at least 81 chars and separated by a colon',
        '',
        'Did you copy & paste the seed into the terminal?'
      ].join('\n'))
      err.type = 'EUSAGE'
      return cb(err)
    }

    if (!smidgen.iota.valid.isTrytes(seed.split(':')[0])) {
      const err = new Error('Invalid seed1')
      err.type = 'EUSAGE'
      return cb(err)
    }
    if (!smidgen.iota.valid.isTrytes(seed.split(':')[1])) {
      const err = new Error('Invalid seed2')
      err.type = 'EUSAGE'
      return cb(err)
    }

    cb(null, seed)
  })
}
