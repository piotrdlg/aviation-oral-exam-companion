import { describe, expect, it } from 'vitest';
import { scrubCrash } from '../crash-reporting';

describe('crash privacy', () => {
  it('keeps stack locations while discarding personal and exam payloads', () => {
    const event = scrubCrash({
      type: undefined,
      message: 'Student answer: confidential',
      user: { email: 'pilot@example.com' },
      request: { headers: { Authorization: 'Bearer secret' }, data: 'exam transcript' },
      extra: { answer: 'confidential' },
      breadcrumbs: [{ message: 'spoken answer' }],
      exception: { values: [{ type: 'TypeError', value: 'pilot@example.com: confidential', stacktrace: { frames: [{ filename: 'app.js?token=secret', lineno: 42 }] } }] },
    });
    const json = JSON.stringify(event);
    expect(json).not.toMatch(/confidential|secret|pilot@|spoken/);
    expect(event.exception?.values?.[0].stacktrace?.frames?.[0]).toMatchObject({ filename: 'app.js', lineno: 42 });
  });
});
