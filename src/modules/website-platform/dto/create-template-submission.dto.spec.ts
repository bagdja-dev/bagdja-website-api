import { validate } from 'class-validator';

import { CreateTemplateSubmissionDto } from './create-template-submission.dto';

function validSubmission(): CreateTemplateSubmissionDto {
  return Object.assign(new CreateTemplateSubmissionDto(), {
    packageName: '@bagdja/storefront-demo',
    packageVersion: '1.2.3',
    description: 'A complete storefront template for Bagdja Website Builder.',
    changelog: 'Initial reviewed release.',
    license: 'MIT',
    githubUrl: 'https://github.com/bagdja/storefront-demo',
  });
}

describe('CreateTemplateSubmissionDto', () => {
  it('accepts a scoped package with an exact semver version', async () => {
    await expect(validate(validSubmission())).resolves.toHaveLength(0);
  });

  it('rejects npm tags and semver ranges', async () => {
    const latest = validSubmission();
    latest.packageVersion = 'latest';
    const range = validSubmission();
    range.packageVersion = '^1.2.3';

    expect(await validate(latest)).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'packageVersion' })]),
    );
    expect(await validate(range)).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'packageVersion' })]),
    );
  });

  it('does not accept name or slug from the form (read from manifest.json instead)', () => {
    expect(Object.keys(validSubmission())).not.toEqual(expect.arrayContaining(['name', 'slug']));
  });

  it('requires a valid GitHub repository URL', async () => {
    const missing = validSubmission();
    delete (missing as Partial<CreateTemplateSubmissionDto>).githubUrl;
    const invalid = validSubmission();
    invalid.githubUrl = 'https://example.com/bagdja/storefront-demo';

    expect(await validate(missing)).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'githubUrl' })]),
    );
    expect(await validate(invalid)).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'githubUrl' })]),
    );
  });
});
