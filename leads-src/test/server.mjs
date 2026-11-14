import { loadGas, serve } from './gas-emulator.mjs'
const gas = loadGas({ csvPath: './sheet.csv', codePath: '../backend/Code.gs' })
gas.api.setup()
serve(gas, 8787)
console.log('emulator on 8787')
