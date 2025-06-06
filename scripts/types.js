import { exec } from 'child_process';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import ora from 'ora';

// Load environment variables from .env
dotenv.config();
const { ADMIN_EMAIL, ADMIN_PASSWORD, TYPES_DIR, DIRECTUS_URL, OUT_FILE } = process.env;
const targetFile = `${TYPES_DIR}/${OUT_FILE}`;

// Main function
(async () => {
  // Check if the directory exists
  if (!fs.existsSync(TYPES_DIR)) {
    console.error(`Error: The directory '${TYPES_DIR}' does not exist.`);
    process.exit(1);
  }

  // Auto-overwrite for testing
  if (fs.existsSync(targetFile)) {
    console.log(`Overwriting existing file: ${targetFile}`);
  }

  // Start the spinner
  const spinner = ora('Generating types...').start();

  // Get the correct path to the CLI script
  const cliPath = path.resolve(process.cwd(), 'build/cli.cjs');

  // Get any additional arguments passed to this script (everything after --)
  const additionalArgs = process.argv.indexOf('--') !== -1 
    ? process.argv.slice(process.argv.indexOf('--') + 1).join(' ')
    : '';

  // Build the command string - use node to run the local build directly
  const command = `node ${cliPath} --host ${DIRECTUS_URL} -u true --email ${ADMIN_EMAIL} --password ${ADMIN_PASSWORD} --typeName ApiCollections --outFile ${targetFile} -m true -s true ${additionalArgs}`;

  console.log(`- ${command}`);

  // Execute the command with output to debug.log if not specified in additionalArgs
  const hasLogFile = additionalArgs.includes('--logFile');
  // If user specified a log file, use their specified file, otherwise use debug.log
  const command2 = hasLogFile ? command : `${command} > debug.log 2>&1`;
  exec(command2, (error, stdout, stderr) => {
    if (error) {
      spinner.fail(`Error: ${error.message}`);
      return;
    }

    if (stderr) {
      spinner.fail(`stderr: ${stderr}`);
      return;
    }

    console.log(stdout);

    // Stop the spinner and print the success message
    const logFileInfo = hasLogFile 
      ? `(debug logs written to ${additionalArgs.match(/--logFile\s+([^\s]+)/)?.[1] || 'specified log file'})`
      : '(see debug.log for details)';
    spinner.succeed(`Successfully generated a new type file at '${targetFile}' ${logFileInfo}`);
  });
})();
