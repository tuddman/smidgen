//custom iotacooler module
'use strict'

const fs = require('fs')
const assert = require('assert')
const smidgen = require('../smidgen.js')
const getSeed = require('../get-seed.js')
const { maybeGetKeyIndex } = require('../accounts.js')
const {
  parseOutputs, //TODO: clean up not needed imports
  validateInputs,
  getFullTransferObjects,
  checkTransfers
} = require('./transfer.js')

const cmds = {
  'get-addresses': getAddresses,
  'is-address-spent': isAddressSpent,
  'recover-funds-sign': recoverFundsSign,
  'recover-funds-send': recoverFundsSend
}

module.exports = (exports = cmds)

const usage = `Usage:
smidgen iotacooler get-addresses <start index> <end index>
smidgen iotacooler ia-address-spent <address>
smidgen iotacooler recover-funds-sign <index> <receiving address> <full balance>
smidgen iotacooler recover-funds-send <transfer data>

Note:
These commands are used internally by iotacooler, do not use manually!`

const shortUsage = usage

exports.cli = cli
exports.cli.usage = shortUsage

function cli ([ command, ...args ], cb) {
  let startIndex, endIndex, address, index, amount
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
      [ transferData ] = args
      recoverFundsSend(smidgen.iota, transferData, cb)
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

  console.log('Enter your iotacooler seeds. Order: online, offline')
  getSeed((err, seed) => { //online seed
    if (err) return cb(err)

    onlineSeed = seed
    continueWithOnlineSeed()
  })

  function continueWithOnlineSeed() { //offline seed
    getSeed((err, seed) => {
      if (err) return cb(err)

      offlineSeed = seed
      continueWithSeeds()
    })
  }

  function continueWithSeeds() {
    let addressesArray = [ ]
    
    assert.ok(
      ((startIndex >= 0) && (startIndex <= endIndex)),
      'Index args wrong!'
    )
    
    console.log(`Generating addresses from index ${startIndex} to index ${endIndex};`)
    for (let i = startIndex; i <= endIndex; i++) {
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
  amount = Number(amount)
  assert.ok(
    (index >= 0) && Number.isInteger(amount) && (amount > 0),
    'Invalid index or amount')

  assert.ok(
    (iota.valid.isAddress(receivingAddr) && iota.utils.isValidChecksum(receivingAddr)),
    'Invalid address'
  )

  let onlineSeed, offlineSeed

  console.log('Enter your iotacooler seeds. Order: online, offline')
  getSeed((err, seed) => { //online seed
    if (err) return cb(err)

    onlineSeed = seed
    continueWithOnlineSeed()
  })

  function continueWithOnlineSeed() { //offline seed
    getSeed((err, seed) => {
      if (err) return cb(err)

      offlineSeed = seed
      continueWithSeeds()
    })
  }

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
                console.log('SignValid:true:', finalBundle)
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

function recoverFundsSend (iota, transferData, cb) {
  //TODO
}