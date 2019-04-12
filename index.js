#!/usr/bin/env node

const tls = require('tls');
const readline = require('readline');
const program = require('commander');
const chalk = require('chalk');
const Writable = require('stream').Writable;

program
  .version('0.0.1', '-v, --version')
  .name('imapc')
  .description('imapc is a utility for testing the operation of an imap server')
  .option('-n, --hostname [hostname]', 'hostname to connect to')
  .option('-p, --port <port>', 'port to connect to', 993)
  .option('-u, --user [user], userid to use for authentication')
  .parse(process.argv);

const {
  args,
  hostname: host,
  port,
  user,
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

  let authMechanism = null;

  const mutableStdout = new Writable({
    write: function (chunk, encoding, callback) {
      if (!this.muted) {
        process.stdout.write(chunk, encoding);
      }
      callback();
    }
  });

  mutableStdout.muted = false;

  socket.on('data', (data) => {
    let prompt = false;
    const responseRegex = new RegExp(/^(\*|[A-Za-z0-9]*) (OK|BAD|NO) (.*?)$/gm);
    const mechanismRegex = new RegExp(/^.*?\[CAPABILITY.*?AUTH=PLAIN\].*?$/g);
    const authFailedRegex = new RegExp(/^.*?\[AUTHENTICATIONFAILED\].*?$/g);

    const response = data.replace(responseRegex, (full, $1, $2, $3) => {
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

      if (!authMechanism) {
        initialPrompt = true;

        if (mechanismRegex.test($3)) {
          authMechanism = 'plain';
        }
      } else {
        initialPrompt = authFailedRegex.test($3);
      }

      mutableStdout.muted = false;

      return chalk`${seq} {bold {${color} ${$2}}} ${$3}`
    });

    process.stdout.write(`${response}\n`);

    if (prompt || initialPrompt) {
      if (initialPrompt) {
        if (user && authMechanism === 'plain') {
          // show password prompt
          rl.setPrompt(chalk`{bold password:} `);
          rl.prompt();
          mutableStdout.muted = true;
        }

        // initialPrompt = false;
      } else {
        console.timeEnd('Time elapsed');

        // show imapc prompt
        rl.setPrompt(chalk`{bold {cyan imapc>}} `);
        process.stdout.write('\n');
      }

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
    output: mutableStdout,
    prompt: chalk`{bold {cyan imapc>}} `,
    terminal: true,
  });

  const comandSeqRegex = new RegExp(/(^[A-Za-z0-9]*).*?/);

  rl.on('line', (line) => {
    let input = line;

    if (mutableStdout.muted) {
      const identity = Buffer.from(`\0${user}\0${line}`).toString('base64');
      input = `A01 AUTHENTICATE PLAIN ${identity}`
      process.stdout.write('\n');
      rl.history = rl.history.slice(1);
    }

    matches = comandSeqRegex.exec(input);
    commandSeq = matches[1];

    socket.write(input + '\r\n');

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
