# IOTAcooler-Smidgen Deployment

## As Single Executable

The following steps describe how to compile smidgen into a single binary file for Windows, macOS and Linux

1. install **`nodejs`** and **`npm`**
2. install **`pkg`** with `npm install -g pkg`
3. **`cd`** into the `source` directory
4. install missing local npm dependencies with `npm install`
5. create executables with `pkg .`
6. see [targets](https://www.npmjs.com/package/pkg#targets) for arch specific requirements
