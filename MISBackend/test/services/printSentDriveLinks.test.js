const { findPrintDriveLinks } = require('../../src/services/printSentDriveLinks');

const body = (mimeType, text) => ({ mimeType, body: { data: Buffer.from(text).toString('base64url') } });

test('reads Gmail Drive labels and combines HTML and plain-text copies by file ID', async () => {
  const parts = [
    body('text/plain', 'Unpreferred name.pdf <https://drive.google.com/open?id=fileId123456>'),
    body('text/html', `<a href="https://drive.google.com/file/d/fileId123456/view?usp=drive_link&amp;resourcekey=0-example">
      <img src="icon.png"><span>Board &amp; Banner &#x2013; Final.cdr</span></a>
      <a href="https://drive.google.com.evil.example/file/d/otherId123456/view">Fake attachment</a>
      <blockquote><a href="https://drive.google.com/file/d/quotedId123456/view">Old file.cdr</a></blockquote>`),
  ];
  expect(await findPrintDriveLinks(null, 'message', parts)).toEqual([
    { id: 'fileId123456', resourceKey: '0-example', name: 'Board & Banner – Final.cdr' },
  ]);
});

test('reads Drive attachment names from separate plain-text message parts', async () => {
  const get = jest.fn().mockResolvedValue({ data: { data: Buffer.from(
    '[image: Poster.cdr]\n<https://drive.google.com/open?id=otherId123456>\nBare <https://drive.google.com/file/d/anotherId123456/view>',
  ).toString('base64url') } });
  const gmail = { users: { messages: { attachments: { get } } } };
  const parts = [{ mimeType: 'text/plain', body: { attachmentId: 'body-id', size: 500 } }];
  expect(await findPrintDriveLinks(gmail, 'message', parts)).toEqual([
    { id: 'otherId123456', resourceKey: '', name: 'Poster.cdr' },
    { id: 'anotherId123456', resourceKey: '', name: '' },
  ]);
  expect(get).toHaveBeenCalledWith({ userId: 'me', messageId: 'message', id: 'body-id', fields: 'data' }, undefined);
});
