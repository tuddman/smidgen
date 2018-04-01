//custom iotacooler module
'use strict'

const fs = require('fs')
const assert = require('assert')
const read = require('read')
const async = require("async");
const smidgen = require('../smidgen.js')
const getSeed = require('../get-seed.js')

const cmds = {
  'get-addresses': getAddresses,
  'is-address-spent': isAddressSpent,
  'recover-funds-sign': recoverFundsSign,
  'recover-funds-send': recoverFundsSend,
  'get-adddress-transfers-quick': getAddressTransfersQuick,
  'get-adddress-transfers': getAddressTransfers
}

module.exports = (exports = cmds)

const usage = `Usage:
smidgen iotacooler get-addresses <start index> <end index>
smidgen iotacooler is-address-spent <address>
smidgen iotacooler recover-funds-sign <index> <receiving address> <full balance>
smidgen iotacooler recover-funds-send <receiving address> <signed bundle as trytes>
smidgen iotacooler get-address-transfers-quick <address>
smidgen iotacooler get-address-transfers <address> <include confirmation state>

Note:
These commands are used internally by iotacooler, do not use manually!`

const shortUsage = usage

exports.cli = cli
exports.cli.usage = shortUsage

function cli ([ command, ...args ], cb) {
  let startIndex, endIndex, address, index, amount, tryteBundle, confState
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

    case 'get-address-transfers-quick':
    [ address ] = args
    getAddressTransfersQuick(smidgen.iota, address, cb)
    break

    case 'get-address-transfers':
    [ address, confState ] = args
    getAddressTransfers(smidgen.iota, address, confState, cb)
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

//get transfers without clean tail tx hashes, fast but incomplete
function getAddressTransfersQuick (iota, address, cb) {
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

//get full transfer bundles associated with an address, slow
function getAddressTransfers (iota, address, confState, cb) {
  assert.ok(
    (address.length > 0),
    'Address argument missing!'
  )

  let addresses = [ address ]
  let inclusionStates = (confState == 'true')

  //begin credits (c) IOTA Stiftung 2017, https://github.com/iotaledger/iota.lib.js/blob/master/lib/api/api.js
  var self = iota.api;
  var callback = cb

  // call wrapper function to get txs associated with addresses
  self.findTransactionObjects({'addresses': addresses}, function(error, transactionObjects) {

    if (error) return callback(error);

    // set of tail transactions
    var tailTransactions = new Set();
    var nonTailBundleHashes = new Set();

    transactionObjects.forEach(function(thisTransaction) {

      // Sort tail and nonTails
      if (thisTransaction.currentIndex === 0) {

        tailTransactions.add(thisTransaction.hash);
      } else {

        nonTailBundleHashes.add(thisTransaction.bundle)
      }
    })

    // Get tail transactions for each nonTail via the bundle hash
    self.findTransactionObjects({'bundles': Array.from(nonTailBundleHashes)}, function(error, bundleObjects) {

      if (error) return callback(error);

      bundleObjects.forEach(function(thisTransaction) {

        if (thisTransaction.currentIndex === 0) {

          tailTransactions.add(thisTransaction.hash);
        }
      })

      var finalBundles = [];
      var tailTxArray = Array.from(tailTransactions);

      // If inclusionStates, get the confirmation status
      // of the tail transactions, and thus the bundles
      async.waterfall([

        //
        // 1. Function
        //
        function(cb) {

          if (inclusionStates) {

            self.getLatestInclusion(tailTxArray, function(error, states) {

              // If error, return it to original caller
              if (error) return callback(error);

              cb(null, states);
            })
          } else {
            cb(null, []);
          }
        },

        //
        // 2. Function
        //
        function(tailTxStates, cb) {

          // Map each tail transaction to the getBundle function
          // format the returned bundles and add inclusion states if necessary
          async.mapSeries(tailTxArray, function(tailTx, cb2) {

            self.getBundle(tailTx, function(error, bundle) {

              // If error returned from getBundle, simply ignore it
              // because the bundle was most likely incorrect
              if (!error) {

                // If inclusion states, add to each bundle entry
                if (inclusionStates) {
                  var thisInclusion = tailTxStates[tailTxArray.indexOf(tailTx)];

                  bundle.forEach(function(bundleTx) {

                    bundleTx['persistence'] = thisInclusion;
                  })
                }

                finalBundles.push(bundle);
              }
              cb2(null, true);
            })
          }, function(error, results) {

            // credit: http://stackoverflow.com/a/8837505
            // Sort bundles by timestamp
            finalBundles.sort(function(a, b) {
              var x = parseInt(a[0]['attachmentTimestamp']); var y = parseInt(b[0]['attachmentTimestamp']);
              return ((x < y) ? -1 : ((x > y) ? 1 : 0));
            });

            //return callback(error, finalBundles);
            console.log('Bundles: ', finalBundles);
          })
        }
      ])
    })
  })
  //end credits
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
