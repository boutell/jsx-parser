"use strict";

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

// export default parseFile;

// function parseFile(file) {
//   const it = jsx[Symbol.iterator]();
//   const ti = tokenizer(it);
//   return parseModule(ti);
// }

// function parseModule(ti) {
//   let result = '';
//   for (const r of parseJs()) {
//     result += r;
//   }
//   return result;
// }

// function parseJs(ti) {

// }

export function tokenizer(it) {
  if (!it.push) {
    it = pushable(it);
  }
  let state = 'init';
  let value = '';
  let subtokenizer = null;
  let backtickDepth = null;
  let jsxDepth = null;
  let jsxInterpolationDepth = null;
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
        value = '';
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
      } else if (ch.value === '\'') {
        value += ch.value;
        state = 'init';
        return returnValue();
      } else if (ch.value === '\\') {
        value += ch.value;
        state = 'singleQuotedEscape';
      } else if (ch.value === '\n') {
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
      } else if (ch.value === '"') {
        value += ch.value;
        state = 'init';
        return {
          value
        };
      } else if (ch.value === '\\') {
        value += ch.value;
        state = 'doubleQuotedEscape';
      } else if (ch.value === '\n') {
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
        backtickDepth = 1;
        subtokenizer = tokenizer(it);
        state = 'interpolating';
      }
    },
    interpolating(ch) {
      const token = subtokenizer.next();
      if (token.done) {
        throw error(ch, 'Unexpected end of file following `...${, closing } expected');
      }
      if (token === '{') {
        backtickDepth++;
      } else if (token === '}') {
        backtickDepth--;
        if (!backtickDepth) {
          state = 'backticked';
        }
      }
      return token;
    },
    word(ch) {
      if (ch.done) {
        it.push(ch);
        state = 'init';
        return {
          value
        };
      } else if (isWhitespace(ch.value)) {
        if (value === 'return') {
          state = 'jsx?1';
          return pushAndReturnValue(ch);
        } else {
          state = 'init';
          return returnValue();
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
      return {
        value: ch.value
      };
    },
    'jsx?2'(ch) {
      console.log('made it to jsx?2');
      if (isWhitespace(ch.value)) {
        console.log('still jsx?2');
        return ch;
      } else if (ch.value === '(') {
        // still possibly jsx (we will let js worry about mis-nesting)
      } else if (ch.value === '<') {
        console.log('really ought to be a tag name about now!');
        state = 'jsxTagName';
        value = '';
      } else {
        state = 'init';
        return ch;
      }
    },
    jsxTagOrText(ch) {
      if (isWhitespace(ch.value)) {
        value += ch.value;
      } else if (ch.value === '{') {
        jsxInterpolationDepth = 1;
        subtokenizer = tokenizer(it);
        state = 'jsxInterpolating';
      } else if (ch.value === '<') {
        state = 'jsxTagName';
        if (value.length) {
          return returnValue({
            type: 'tagText',
            value
          });
        }
      } else if (ch.done) {
        if (value.length) {
          it.push(ch);
          return returnValue({
            type: 'tagText',
            value
          });
        } else {
          return ch;
        }
      } else {
        value += ch.value;
      }
    },
    jsxInterpolating(ch) {
      const token = subtokenizer.next();
      if (token.done) {
        throw error(ch, 'Unexpected end of file following `{` in JSX, closing `}` expected');
      }
      if (token === '{') {
        jsxInterpolationDepth++;
      } else if (token === '}') {
        jsxInterpolationDepth--;
        if (!jsxInterpolationDepth) {
          state = 'jsxTagOrText';
        }
      }
      return token;
    },
    jsxTagName(ch) {
      if (isWhitespace(ch.value)) {
        if (value.length > 0) {
          // We weren't sure until now that this was an opening tag
          jsxDepth++;
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
        jsxDepth++;
        state = 'jsxTagOrText';
        return returnValue({
          type: 'tagName',
          value
        });
      } else if (ch.value === '/') {
        if (jsxDepth === 0) {
          throw error(ch, 'too many closing </...> in JSX expression');
        }
        state = 'jsxClosingTagName';
      } else if (isPunctuation(ch.value)) {
        throw error(ch, 'tag name or > expected after < at start of JSX expression');
      } else {
        value += ch.value;
      }
    },
    jsxClosingTagName(ch) {
      if (isWhitespace(ch.value)) {
        if (value.length > 0) {
          state = 'jsxClosingTag';
        } else {
          throw error(ch, 'closing > expected in </...> in JSX expression');
        }
      } else if (ch.value === '>') {
        jsxDepth--;
        console.log(`new depth is ${jsxDepth}`);
        if (!jsxDepth) {
          state = 'init';
        } else {
          state = 'jsxTagOrText';
        }
        return returnValue({
          type: 'closeTag',
          value
        });
      } else if (isPunctuation(ch.value)) {
        throw error(ch, 'tag name and > expected at end of JSX closing tag');
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
      } else if (ch.value === '=') {
        if (value.length > 0) {
          it.push(ch);
          state = 'jsxAttributeValueOrNext';
          return returnValue({
            type: 'attributeName',
            value
          });
        }
      } else if (isPunctuation(ch.value)) {
        throw error(ch, 'expected whitespace, /, >, or = to end JSX attribute name');
      } else {
        value += ch.value;
      }
    },
    jsxAttributeValueOrNext(ch) {
      if (isWhitespace(ch)) {
        return;
      } else if (ch.value === '=') {
        state = 'jsxAttributeValue';
      } else if (ch.value === '/') {
        return returnValue({
          type: 'fastClose'
        });
      } else if (ch.value === '>') {
        state = 'jsxBody';
        return returnValue({
          type: 'startBody'
        });
      } else if (isPunctuation(ch.value)) {
        throw error(ch, 'equal sign, next attribute or end of tag expected');
      } else {
        // Previous attribute was boolean, push it back and consider it as next attribute name
        it.push(ch);
        state = 'jsxAttribute';
      }
    },    
    jsxAttributeValue(ch) {
      if (isWhitespace(ch)) {
        return;
      } else if (ch.value === '"') {
        state = 'jsxAttributeDoubleQuoted';
        return;
      } else if (ch.value === '\'') {
        state = 'jsxAttributeSingleQuoted';
        return;
      } else {
        throw error('single or double quote expected after = in JSX attribute');
      }
    },
    jsxAttributeDoubleQuoted(ch) {
      if (ch === '"') {
        state = 'jsxAttribute';
        return returnValue({
          type: 'attributeValue',
          value
        });
      } else {
        value += ch;
      }
    },
    jsxAttributeSingleQuoted(ch) {
      if (ch === '\'') {
        state = 'jsxAttribute';
        return returnValue({
          type: 'attributeValue',
          value
        });
      } else {
        value += ch;
      }
    },
    // TODO:
    // parse quoted values, single and double quoted
    // parse spread attributes
    // parse interpolated attributes
    // parse interpolation in the text of a component
    // test everything
  };
  return {
    next() {
      let result;
      do {
        try {
          let ch = it.next();
          result = interpret[state](ch);
        } catch (e) {
          console.error(`error in state ${state}:`);
          throw e;
        }
      } while (result === undefined);
      return result;
    }
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
    let remainder = '';
    while (true) {
      const { value, done } = it.next();
      if (done) {
        break;
      }
      remainder += value;
    }
    throw new Error(`Row ${ch.row}, column ${ch.col}: ${s} (saw ${ch.value})\n` +
      `remainder is: ${remainder}`
    );
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
        ...next,
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
  const code = char?.charCodeAt(0);
  return ((code >= 33) && (code <= 47)) || ((code >= 58) && (code <= 64)) || ((code >= 91) && (code <= 96)) || ((code >= 123) && (code <= 126));
}

function isWhitespace(char) {
  const code = char.charCodeAt(0);
  return (code === 10) || (code === 13) || (code === 32) || (code === 8);
}
