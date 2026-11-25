import { describe, expect, it } from 'vitest';
import { TAG_MAX, addTags, removeTag, suggestions } from './catalog';

describe('tags', () => {
  it('adds typed tags: split at commas, trimmed, no duplicates in any case, order kept', () => {
    expect(addTags(['Crypt'], ' undead ,  dark   tower, crypt,,UNDEAD ')).toEqual(['Crypt', 'undead', 'dark tower']);
    expect(addTags([], '   ')).toEqual([]);
  });

  it('cuts very long tags', () => {
    expect(addTags([], 'x'.repeat(100))[0]).toHaveLength(TAG_MAX);
  });

  it('removes a tag', () => {
    expect(removeTag(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('suggestions', () => {
  const tags = ['undead', 'Crypt', 'crypt', 'crypt', 'forest', 'Undead', 'cave', ''];

  it('most used first, then alphabetically; one spelling per value', () => {
    expect(suggestions(tags)).toEqual(['crypt', 'undead', 'cave', 'forest']);
  });

  it('leaves out what is already chosen and filters by a query', () => {
    expect(suggestions(tags, ['CRYPT'])).toEqual(['undead', 'cave', 'forest']);
    expect(suggestions(tags, [], 'ca')).toEqual(['cave']);
    expect(suggestions(tags, [], 'E')).toEqual(['undead', 'cave', 'forest']);
  });
});
