import { tokenizer } from '../index.js';

const test = `
import something from './somewhere.js';

export default function({ name }, { template }) {
  return (
    <>
      <h1>Hello</h1>
      <p>
        Hi there, { name }.
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
  console.log(token);
}
