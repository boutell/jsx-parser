import { tokenizer } from '../index.js';

const test = `
import something from './somewhere.js';

export default function({ name }, { template }) {
  const fancy = 'hi there'; // \`Dr. \${name}, Esquire\`;
  return (
    <>
      <h1>Hello</h1>
      <p>
        Hi there, { fancy }.
      </p>
    </>
  );
}
`;

const to = tokenizer(test[Symbol.iterator]());
while (true) {
  const token = to.next();
  if (token.done) {
    break;
  }
  console.log(`\nEmitted: ${JSON.stringify(token)}\n`);
}
