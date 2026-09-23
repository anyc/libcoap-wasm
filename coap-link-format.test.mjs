import assert from 'node:assert/strict';
import test from 'node:test';
import {parseLinkFormat} from './coap-link-format.js';

test('parses resource links and keeps all attributes', () => {
  assert.deepEqual(parseLinkFormat(
    '</time>;ct=0;title="Internal Clock";rt="ticks";obs,' +
    '</example_data>;ct=0;title="Example, data; with \\"quotes\\"";obs'
  ), [
    {
      href: '/time',
      attributes: [
        {name: 'ct', value: '0'},
        {name: 'title', value: 'Internal Clock'},
        {name: 'rt', value: 'ticks'},
        {name: 'obs', value: true}
      ]
    },
    {
      href: '/example_data',
      attributes: [
        {name: 'ct', value: '0'},
        {name: 'title', value: 'Example, data; with "quotes"'},
        {name: 'obs', value: true}
      ]
    }
  ]);
});

test('preserves nested paths and repeated attributes', () => {
  assert.deepEqual(parseLinkFormat('</sensors/room>;rt="temp";rt="humidity"'), [
    {
      href: '/sensors/room',
      attributes: [{name: 'rt', value: 'temp'}, {name: 'rt', value: 'humidity'}]
    }
  ]);
  assert.deepEqual(parseLinkFormat('  '), []);
});

test('rejects incomplete links', () => {
  assert.throws(() => parseLinkFormat('</time>;title="unfinished'), SyntaxError);
  assert.throws(() => parseLinkFormat('time;obs'), SyntaxError);
});
