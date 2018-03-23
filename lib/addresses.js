'use strict'

exports.testWasAddressUsed = testWasAddressUsed
function testWasAddressUsed (iota, address, cb) {

  //upgrade api call [IOTACOOLER custom extended check]
  /*iota.api.findTransactionObjects({ addresses: [ address ] }, (err, data) => {
    if (err) return cb(err)

    const foundSpent = data.filter((transaction) => {
      return transaction.value < 0
    })

    cb(null, foundSpent.length > 0)
  })*/

  //check also pre snapshot for address reuse
  iota.api.wereAddressesSpentFrom(address, (err, wereSpent) => {
    if (err) return cb(err)

    cb(null, wereSpent[0])
  })

}
