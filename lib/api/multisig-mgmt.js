#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const osenv = require('osenv');
const home = osenv.home();
const util = require('util');
const smidgen = require('../smidgen/lib/smidgen');
const multisig = require('../smidgen/lib/cmds/multisig');
const {
  parseOutputs,
  validateInputs,
  getFullTransferObjects
} = require('../smidgen/lib/cmds/transfer')


const parsed = {};
parsed.smidgenconf = path.join(home, '.smidgenrc');

if (!fs.existsSync(parsed.smidgenconf)) {
  fs.writeFileSync(
    parsed.smidgenconf,
    '{"provider": "http://192.168.1.7:14265"}',
  );
}

const conf = {json: true, security: 2};


// ---------------------  Load profile

const load = (parsed, cb) => {
  smidgen.load(parsed, (err, smidgen) => {
    if (!parsed) {
      cb('load error', null);
    } else if (err) {
      cb('load error', null);
    } else {
      cb(null, smidgen);
    }
  });
};

// ---------------------  Generate Seeds & Addresses

const generateSeed = (smidgen, cb) => {
  smidgen.commands['generate-seed'](smidgen.iota, conf, (err, seed) => {
    if (err) {
      console.error(err);
      cb('generate seed error', null);
    } else {
      cb(null, seed);
    }
  });
};

const generateAddress = (smidgen, seed, cb) => {
  let configuration = Object.assign(smidgen.config, {json: true}); // why not conf?
  smidgen.commands['generate-address'](
    smidgen.iota,
    seed,
    configuration,
    (err, seed) => {
      if (err) {
        console.error(err);
        cb('generate address error', null);
      } else {
        cb(null, seed);
      }
    },
  );
};

// ---------------------  Get Balance(s)

const getBalance = (smidgen, address, cb) => {
  let configuration = Object.assign(smidgen.config, {json: true}); // why not conf?
  smidgen.commands['get-balance'](
    smidgen.iota,
    configuration,
    address,
    (err, seed) => {
      if (err) {
        console.error(err);
        cb('getBalance error', null);
      } else {
        cb(null, seed);
      }
    },
  );
};

// ---------------------  MultiSignature

const multiSigCreate = (smidgen, seed, name, file, cb) => {
  multisig['create'](smidgen.iota, conf, seed, name, file, (err, resp) => {
    if (err) {
      console.error(err);
      cb('multisig create error', null);
    } else {
      cb(null, resp);
    }
  });
};

const multiSigAdd = (smidgen, seed, name, file, cb) => {
  multisig['add'](smidgen.iota, conf, seed, name, file, (err, resp) => {
    if (err) {
      console.error(err);
      cb('multisig add error', null);
    } else {
      cb(null, resp);
    }
  });
};

const multiSigFinalize = (smidgen, file, cb) => {
  multisig['finalize'](smidgen.iota, conf, file, (err, resp) => {
    if (err) {
      console.error(err);
      cb('multisig finalize error', null);
    } else {
      cb(null, resp);
    }
  });
};


// ---------------------  MultiSignature - Transfer
//
// notes: multisig transfer method + args => 
// smidgen transfer 3 XYZ... bob multisig.txt

// note: name === id e.g. 'bob'
const multiSigTransfer = (value, address, name, file, cb) => {
  let args = [value, address] 
  const parsedOutputs = parseOutputs(args)
  cliTransfer(parsedOutputs, name, file, cb)


  multisig['transfer'](value, address, file, (err, resp) => {
    if (err) {
      console.error(err);
      cb('multisig tranfer error', null);
    } else {
      cb(null, resp);
    }
  });
};


// ---------------------  Promisify

const asyncLoad = util.promisify(load);
const asyncGenerateSeed = util.promisify(generateSeed);
const asyncGenerateAddress = util.promisify(generateAddress);
const asyncGetBalance = util.promisify(getBalance);
const asyncMultiSigCreate = util.promisify(multiSigCreate);
const asyncMultiSigAdd = util.promisify(multiSigAdd);
const asyncMultiSigFinalize = util.promisify(multiSigFinalize);
const asyncMultiSigTransfer = util.promisify(multiSigTransfer);

// ---------------------  Test Usage - Async / Await 

async function createMultiSigWallet() {
  let smidgen = await asyncLoad(parsed) 
  let alicesSeed = await asyncGenerateSeed(smidgen)
  let bobsSeed = await asyncGenerateSeed(smidgen)
  let wallet = await asyncMultiSigCreate(smidgen, alicesSeed.seed, 'alice', 'wallet-1.txt')
  let addBob = await asyncMultiSigAdd(smidgen, bobsSeed.seed, 'bob', 'wallet-1.txt')
  let finalized = await asyncMultiSigFinalize(smidgen,  'wallet-1.txt')


  console.log('alice\'s seed ->')
  console.log(alicesSeed)
  console.log('bob\'s seed ->')
  console.log(bobsSeed)
  console.log('finalized ->')
  console.log(finalized)
}

createMultiSigWallet();

