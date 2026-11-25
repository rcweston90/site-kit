/*
 * How a record is named while its delete waits for Undo. An editor's Delete
 * hides its record in the list it returns to, so both sides build the key the
 * same way: recordKey('post', 'my-post') is 'post:my-post'.
 */
export const recordKey = (kind: string, id: string | number) => `${kind}:${id}`;
