import { WebsitePartner } from '../../entities';

describe('WebsitePartner provider role', () => {
  it('defaults to active status for new provider records', () => {
    const vendor = new WebsitePartner();

    expect(vendor.status).toBe('active');
  });
});
