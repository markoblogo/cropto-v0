import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function compile() {
  console.log('🔨 Compiling CROPT smart contract...\n');

  try {
    // Use solcjs from hardhat's dependencies
    const { stdout, stderr } = await execAsync('npx solcjs --version');
    console.log('Solidity compiler version:', stdout.trim());
    
    // Compile contract
    console.log('\n📦 Compiling Cropt.sol...');
    const result = await execAsync(
      'npx solcjs --bin --abi --include-path node_modules --base-path . -o artifacts/contracts/Cropt.sol contracts/Cropt.sol',
      { maxBuffer: 1024 * 1024 * 10 }
    );
    
    if (stderr) {
      console.log('Warnings:', stderr);
    }
    
    console.log('✅ Contract compiled successfully!');
    console.log('\nArtifacts generated in artifacts/contracts/Cropt.sol/');
    
  } catch (error) {
    console.error('❌ Compilation failed:');
    console.error(error.message);
    if (error.stdout) console.log('Output:', error.stdout);
    if (error.stderr) console.error('Errors:', error.stderr);
    process.exit(1);
  }
}

compile();
