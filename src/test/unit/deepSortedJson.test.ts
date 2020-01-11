const {transform} = require('@/lib/deepSortedJson');
const assert = require('chai').assert;

describe('transform', () => {
    it('should return concatenated strings for all keys and add = for values', () => {
        const result = transform({
            a: {
                b: {
                    c: {
                        d: 'e'
                    }
                },
                f: {
                    g: 'h'
                }
            }
        });

        assert.deepEqual(result, [
            'a.b.c.d=e',
            'a.f.g=h',
        ]);
    });

    it('should return sorted array', () => {
        const result = transform({
            a: {
                f: {
                    c: {
                        d: 'e'
                    }
                },
                b: {
                    g: 'h'
                }
            }
        });

        assert.deepEqual(result, [
            'a.b.g=h',
            'a.f.c.d=e',
        ]);
    });

    it('should not add = for empty objects', () => {
        const result = transform({
            a: {
                f: {
                    c: {
                        d: {}
                    }
                },
                b: {
                    g: 'h'
                }
            }
        });

        assert.deepEqual(result, [
            'a.b.g=h',
            'a.f.c.d',
        ]);
    });

    it('should add [index] for array contents', () => {
        const result = transform({
            a: {
                f: [
                    'foo',
                    'bar',
                    'baz',
                ],
            }
        });

        assert.deepEqual(result, [
            'a.f[0]=foo',
            'a.f[1]=bar',
            'a.f[2]=baz',
        ]);
    });
});
