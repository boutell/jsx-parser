// HTML in jsx looks like:
//
// return <...>
// or
// = <...>
//
// or
//
// (<...>
//
// So we need to:
// * Separate comments and strings in JS from other JS
// * Recognize the start of JSX in code that is not a comment or a string
// * Parse JSX itself, including nested JavaScript in {...}
// * Recognize import statements and convert .jsx filenames to .js
// * Emit JS suited to Apostrophe

export default parseFile;

function parseFile(file) {
  const it = jsx[Symbol.iterator]();
  const ti = tokenizer(it);
  return parseModule(ti);
}

function parseModule(ti) {
  let result = '';
  for (const r of parseJs()) {
    result += r;
  }
  return result;
}

function parseJs(ti) {

}

function tokenizer(it) {
  if (!it.push) {
    it = pushable(it);
  }
  let state = 'ready';
  let value = '';
  const interpret = {
    init(ch) {
      if (ch.done) {
        return ch;
      } else if (ch.value === '/') {
        state = 'comment?';
        value = '/';
        return;
      } else if (isWhitespace(ch.value)) {
        return {
          value: ch.value
        };
      } else if (!isPunctuation(ch.value)) {
        value = ch.value;
        state = 'word';
      } else if (ch.value === '\'') {
        value = ch.value;
        state = 'singleQuoted';
      } else if (ch.value === '"') {
        value = ch.value;
        state = 'doubleQuoted';
      } else if (ch.value === '`') {
        value = ch.value;
        state = 'backticked';
      } else if ((ch.value === '(') || (ch.value === '=')) {
        it.push(ch);
        state = 'jsx?1';
      } else {
        return {
          value: ch.value
        };
      }      
    },
    'comment?'(ch) {
      if (ch.done) {
        throw error(ch, 'Unexpected end of file after /');
      } else if (ch.value === '*') {
        state = 'comment1';
        value += ch.value;
      } else if (ch.value === '/') {
        state = 'comment2';
        value += ch.value;
      } else {
        it.push(ch);
        state = 'init';
        return {
          value: '/'
        };
      }
    },
    comment1(ch) {
      if (ch.done) {
        throw error(ch, 'Unexpected end of file after /*');        
      } else if (ch.value === '*') {
        value += ch.value;
        state = 'comment1End?';
      } else {
        value += ch.value;
      }
    },
    'comment1End?'(ch) {
      if (ch.done) {
        throw error(ch, 'Unexpected end of file after /*...*');
      } else if (ch.value === '/') {
        value += '/';
        state = 'init';
        return {
          value
        };
      } else {
        value += ch.value;
        if (ch.value !== '*') {
          state = 'comment1';
        }
      }
    },
    comment2(ch) {
      if (ch.done) {
        it.push(ch);
        return {
          value
        };
      } else if (ch.value === '\n') {
        value += ch;
        state = 'init';
        return {
          value
        };
      } else {
        value += ch.value;
      }
    },
    singleQuoted(ch) {
      if (ch.done) {
        throw error(ch, 'Unexpected end of file inside single-quoted string');
      } else if (ch === '\'') {
        value += ch.value;
        state = 'init';
        return {
          value
        };
      } else if (ch === '\\') {
        value += ch.value;
        state = 'singleQuotedEscape';
      } else if (ch === '\n') {
        throw error(ch, 'Unexpected line break inside single-quoted string');
      } else {
        value += ch.value;
      }
    },
    singleQuotedEscape(ch) {
      // There are many types of escape sequences, but our job here is really just to know
      // we're still inside the string if we hit '
      if (ch.done) {
        throw error(ch, 'Unexpected end of file after \ inside single-quoted string, escape sequence expected');
      } else if (isWhitespace(ch.value)) {
        throw error(ch, 'Unexpected whitespace after \ inside single-quoted string, escape sequence expected');
      } else {
        value += ch.value;
        state = 'singleQuoted';
      }
    },
    doubleQuoted(ch) {
      if (ch.done) {
        throw error(ch, 'Unexpected end of file inside double-quoted string');
      } else if (ch === '"') {
        value += ch.value;
        state = 'init';
        return {
          value
        };
      } else if (ch === '\\') {
        value += ch.value;
        state = 'doubleQuotedEscape';
      } else if (ch === '\n') {
        throw error(ch, 'Unexpected line break inside double-quoted string');
      } else {
        value += ch.value;
      }
    },
    doubleQuotedEscape(ch) {
      // There are many types of escape sequences, but our job here is really just to know
      // we're still inside the string if we hit "
      if (ch.done) {
        throw error(ch, 'Unexpected end of file after \ inside double-quoted string, escape sequence expected');
      } else if (isWhitespace(ch.value)) {
        throw error(ch, 'Unexpected whitespace after \ inside double-quoted string, escape sequence expected');
      } else {
        value += ch.value;
        state = 'doubleQuoted';
      }
    },
    backticked(ch) {
      if (ch.done) {
        throw error(ch, 'Unexpected end of file following `, closing ` expected');
      } else if (ch.value === '`') {
        value += ch.value;
        state = 'init';
        return {
          value
        };
      } else if (ch.value === '$') {
        value += ch.value;
        state = 'interpolated?';
      } else {
        value += ch.value;
      }
    },
    'interpolated?'(ch) {
      if (ch.done) {
        throw error(ch, 'Unexpected end of file following `, closing ` expected');
      } else if (ch.value === '{') {
        let depth = 1;
        const subtokenizer = tokenizer(it);
        while (true) {
          const token = subtokenizer.next();
          if (token.done) {
            throw error(ch, 'Unexpected end of file following `...${, closing } expected');
          }
          value += token.value;
          if (token === '{') {
            depth++;
          } else if (token === '}') {
            depth--;
            if (!depth) {
              state = 'backticked';
              break;
            }
          }
        }        
      }
    },
    word(ch) {
      if (ch.done) {
        it.push(ch);
        return {
          value
        };
      } else if (isWhitespace(ch.value)) {
        if (value === 'return') {
          state = 'jsx?1';
          return pushAndReturnValue(ch);
        }
      } else if ((ch.value === '(') || (ch.value === '=')) {
        state = 'jsx?1';
        return pushAndReturnValue(ch);
      } else if (isPunctuation(ch.value)) {
        state = 'init';
        return pushAndReturnValue(ch);
      } else {
        value += ch.value;
      }
    },
    'jsx?1'(ch) {
      if (ch.value === '=') {
        // Arrow function check
        const next = it.next();
        if (next.value === '>') {
          // Arrow function. Emit the =, then remain in this state to
          // emit the > before we look for the <
          return pushAndReturnValue(ch);
        }
      }
      // Allow the return statement or (, which was pushed back, to emit normally
      state = 'jsx?2';
      return returnValue();
    },
    'jsx?2'(ch) {
      if (isWhitespace(ch.value)) {
        return ch;
      } else if (ch.value === '<') {
        state = 'jsxTag';
        value = '';
      } else {
        state = 'init';
        return ch;
      }
    },
    jsxTag(ch) {
      if (isWhitespace(ch.value)) {
        if (value.length > 0) {
          state = 'jsxAttribute';
          return returnValue({
            type: 'tagName',
            value
          });
        } else {
          // Ignore whitespace before tag name
        }
      } else if (ch.value === '>') {
        // Special case of <> ... </> with no name
        state = 'jsxAttributeName';
        it.push(ch);
        return returnValue({
          type: 'tagName',
          value
        });
      } else if (isPunctuation(ch.value)) {
        throw error(ch, 'tag name or > expected after < at start of JSX expression');
      } else {
        value += ch.value;
      }
    },
    jsxAttribute(ch) {
      if (isWhitespace(ch.value)) {
        if (value.length > 0) {
          state = 'jsxAttributeValueOrNext';
          return returnValue({
            type: 'attributeName',
            value
          });
        } else {
          // Ignore whitespace before attribute name
        }
      } else if (ch.value === '/') {
        if (value.length > 0) {
          it.push(ch);
          return returnValue({
            type: 'attributeName',
            value
          });
        } else {
          return returnValue({
            type: 'fastClose'
          });
        }
      } else if (ch.value === '>') {
        if (value.length > 0) {
          it.push(ch);
          return returnValue({
            type: 'attributeName',
            value
          });
        } else {
          state = 'jsxBody';
          return returnValue({
            type: 'startBody'
          });
        }
      }
    },
    jsxAttributeValueOrNext(ch) {
      if (isWhitespace(ch)) {
        return;
      } else if (ch.value === '"') {
        state = 'attributeDoubleQuoted';
        return;
      } else if (isPunctuation(ch.value)) {
        throw error(ch, 'quoted attribute value, next attribute or end of tag expected');
      } else {
        // Attribute was boolean, push it back and consider it as next attribute name
        it.push(ch);
        state = 'jsxAttribute';
      }
    },    
    // TODO:
    // parse quoted values, single and double quoted
    // parse spread attributes
    // parse interpolated attributes
    // parse body (even more recursive funtimes)
    // test everything
  };
  return {
    next() {
      let result;
      do {
        result = interpret[state](it.next());
      } while (result === undefined);
      return result;
    },
    done: false
  };
  function returnValue(v) {
    const result = {
      value: (v === undefined) ? value : v
    };
    value = '';
    return result;
  }
  function pushAndReturnValue(ch) {
    it.push(ch);
    return returnValue();
  }
  function error(ch, s) {
    throw new Error(`Row ${ch.row}, column ${ch.col}: ${s}`);
  }
}

// Returns a new iterator that allows you to push() values
// back if you decide to let someone else read them with next().
// Also provides row and col properties

function pushable(it) {
  let pushed = [];
  let row = 1;
  let col = 1;
  return {
    next() {
      if (pushed.length > 0) {
        return pushed.pop();
      }
      const next = it.next();
      if (next.done) {
        return next;
      }
      if (next.value === '\n') {
        row++;
        col = 1;
      } else {
        col++;
      }
      return {
        ...it.next(),
        row,
        col
      };
    },
    // ch is the entire object returned by the next() call we want to undo,
    // not just the value
    push(ch) {
      pushed.push(ch);
    }
  };
}

function isPunctuation(char) {
  const code = char.charCodeAt(0);
  return ((code >= 33) && (code <= 64)) || ((code >= 91) && (code <= 127));
}

function isWhitespace(char) {
  const code = char.charCodeAt(0);
  return (code === 10) || (code === 13) || (code === 32) || (code === 8);
}
