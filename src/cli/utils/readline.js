const readline = require('readline');

function ask(question, hidden = false) {
  if (!hidden) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => {
      rl.question(question, answer => { rl.close(); resolve(answer.trim()); });
    });
  }
  process.stdout.write(question);
  const stdin = process.stdin;
  return new Promise(resolve => {
    let password = '';
    const onData = char => {
      char = char.toString();
      if (char === '\n' || char === '\r') {
        stdin.removeListener('data', onData);
        stdin.pause();
        process.stdout.write('\n');
        resolve(password);
      } else if (char === '\u007F' || char === '\b') {
        if (password.length > 0) { password = password.slice(0, -1); process.stdout.write('\b \b'); }
      } else {
        password += char;
        process.stdout.write('*');
      }
    };
    stdin.resume();
    stdin.on('data', onData);
  });
}

function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes');
    });
  });
}

module.exports = { ask, confirm };
