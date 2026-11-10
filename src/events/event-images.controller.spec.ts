import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { mkdtempSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { EventImagesController, uploadDir } from './event-images.controller';

describe('EventImagesController', () => {
  let app: INestApplication;
  const dir = mkdtempSync(join(tmpdir(), 'uploads-'));
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(40, 1),
  ]);

  beforeAll(async () => {
    process.env.UPLOAD_DIR = dir;
    const moduleRef = await Test.createTestingModule({
      controllers: [EventImagesController],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const nest = moduleRef.createNestApplication<NestExpressApplication>();
    nest.useStaticAssets(uploadDir(), { prefix: '/uploads/' });
    app = await nest.init();
  });

  afterAll(() => app.close());

  it('stores a real image and serves it back', async () => {
    const res = await request(app.getHttpServer())
      .post('/events/images')
      .attach('file', png, 'poster.png')
      .expect(201);
    expect(res.body.imageUrl).toMatch(/^\/uploads\/[\w-]+\.png$/);
    expect(readdirSync(dir)).toHaveLength(1);
    await request(app.getHttpServer()).get(res.body.imageUrl).expect(200);
  });

  it('rejects a file that is not an image even if named .png', async () => {
    await request(app.getHttpServer())
      .post('/events/images')
      .attach('file', Buffer.from('<script>alert(1)</script>'), 'x.png')
      .expect(400);
  });

  it('rejects a request with no file', async () => {
    await request(app.getHttpServer()).post('/events/images').expect(400);
  });

  it('rejects a file over 5 MB', async () => {
    const big = Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024 + 10, 2)]);
    await request(app.getHttpServer())
      .post('/events/images')
      .attach('file', big, 'big.png')
      .expect(413);
  });
});
