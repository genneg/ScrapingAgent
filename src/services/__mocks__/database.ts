export class DatabaseService {
  async importFestivalData(data: any, options: any) {
    return jest.fn().mockResolvedValue({
      success: true,
      festivalId: 'test-festival-id',
      errors: [],
      warnings: [],
      stats: {
        venuesCreated: 1,
        teachersCreated: 1,
        musiciansCreated: 1,
        pricesCreated: 1,
        tagsCreated: 2,
      },
    })();
  }
}