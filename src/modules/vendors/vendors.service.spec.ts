import { WebsiteVendor } from '../../entities';

describe('WebsiteVendor', () => {
  it('defaults to active status for new vendor records', () => {
    const vendor = new WebsiteVendor();

    expect(vendor.status).toBe('active');
  });
});
