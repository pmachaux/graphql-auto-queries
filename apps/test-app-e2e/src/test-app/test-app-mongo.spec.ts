import { execSync } from 'child_process';
import { join } from 'path';

describe('Testing Gaq With Mongo connector', () => {
  it('should print a message', () => {
    const cliPath = join(process.cwd(), 'dist/apps/test-app');

    const output = execSync(`node ${cliPath}`).toString();

    expect(output).toMatch(/Hello World/);
  });
});
