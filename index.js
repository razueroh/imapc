#!/usr/bin/env node

const tls = require('tls');
const readline = require('readline');
const program = require('commander');
const chalk = require('chalk');

program
  .version('0.0.1', '-v, --version')
  .name('imapc')
  .description('imapc is a utility for testing the operation of an imap server')
  .option('-p, --port <port>', 'port to connect to', 993)
  .option('-n, --hostname [hostname]', 'hostname to connect to')
  .parse(process.argv);

const {
  args,
  hostname: host,
  port
} = program;

if (!host) {
  if (args.length < 1) {
    program.outputHelp()
  } else {
    console.log(`Unknown option: ${args[0]}`)
  }
}

if (host) {
  /* Globals */
  let commandSeq;
  let initialPrompt;

  const socket = tls.connect({
    port,
    host,
  }, () => {
    const authorized = socket.authorized ?
      'AUTHORIZED' :
      'UNAUTHORIZED';

    initialPrompt = true;

    console.log(chalk`{bold {green CONNECTED} [${authorized}]}\n`);
  });

  socket.setEncoding('utf8');

  socket.on('data', (data) => {
    const regex = new RegExp(/^(\*|[A-Za-z0-9]*) (OK|BAD|NO) (.*?)$/gm);

    let prompt = false;

    const response = data.replace(regex, (full, $1, $2, $3) => {
      let color;

      if ($2 === 'OK') {
        color = 'green';
      } else {
        color = 'red';
      }

      let seq = $1;
      if ($1 !== '*') {
        seq = chalk`{bold {yellow ${$1}}}`
      }

      // validate if is the end of a command to show the prompt
      prompt = $1 && $1 === commandSeq && $2 && $3 && $3 !== 'LOGOUT completed.';

      return chalk`${seq} {bold {${color} ${$2}}} ${$3}`
    });

    process.stdout.write(`${response}\n`);

    if (prompt || initialPrompt) {
      if (initialPrompt) {
        initialPrompt = false;
      } else {
        console.timeEnd('Time elapsed');
        process.stdout.write('\n');
      }

      // show prompt
      rl.prompt();
    }
  });

  socket.on('error', (err) => {
    console.log('Error', err);
  });

  socket.on('end', () => {
    // console.log('Bye!')
  });

  socket.on('close', () => {
    console.log(
      chalk`\n{bold {red DISCONECTED}}`
    );
    process.exit(1);
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk`{bold {cyan imapc>}} `
  });

  rl.on('line', (line) => {
    const regex = new RegExp(/(^[A-Za-z0-9]*).*?/);

    matches = regex.exec(line);
    commandSeq = matches[1];

    socket.write(line + '\r\n');
    
    console.time('Time elapsed');

    process.stdout.write(`\n`);
  });

  rl.on('close', () => {
    console.log(
      chalk`\n{bold {red DISCONECTED}}`
    );
    process.exit(1);
  })
}
