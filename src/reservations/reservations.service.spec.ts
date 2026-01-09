import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ReservationsService } from './reservations.service';
import {
  Reservation,
  ReservationStatus,
  ReservationDocument,
} from './schemas/reservation.schema';
import { ReservationRowDto } from './dto/reservation-row.dto';
import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';

describe('ReservationsService', () => {
  let service: ReservationsService;

  const mockObjectId = new Types.ObjectId();

  const mockReservation = {
    _id: mockObjectId,
    __v: 0,
    reservationId: '123',
    guestName: 'Jan Nowak',
    status: ReservationStatus.PENDING,
    checkInDate: new Date('2024-05-01'),
    checkOutDate: new Date('2024-05-07'),
    save: jest.fn().mockResolvedValue({
      _id: mockObjectId,
      reservationId: '123',
      status: ReservationStatus.PENDING,
    }),
  };

  const mockReservationModel = {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };

  // Constructor function for model
  const MockReservationModel = jest
    .fn()
    .mockImplementation(() => mockReservation);
  Object.assign(MockReservationModel, mockReservationModel);

  let loggerLogSpy: jest.SpyInstance;

  beforeEach(async () => {
    loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationsService,
        {
          provide: getModelToken(Reservation.name),
          useValue: MockReservationModel,
        },
      ],
    }).compile();
    service = module.get<ReservationsService>(ReservationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    loggerLogSpy.mockRestore();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByReservationId', () => {
    it('should return reservation if found', () => {
      mockReservationModel.findOne.mockReturnValue({
        exec: jest.fn(() => mockReservation),
      });
      const result = service.findByReservationId('123');
      return expect(result).resolves.toBe(mockReservation);
    });
    it('should return null if not found', () => {
      mockReservationModel.findOne.mockReturnValue({
        exec: jest.fn(() => null),
      });
      const result = service.findByReservationId('notfound');
      return expect(result).resolves.toBeNull();
    });
  });

  describe('upsert', () => {
    it('should upsert and return reservation', () => {
      const dto: ReservationRowDto = {
        reservationId: '123',
        guestName: 'Jan Nowak',
        status: ReservationStatus.PENDING,
        checkInDate: '2024-05-01',
        checkOutDate: '2024-05-07',
      };
      const updated = { ...mockReservation, ...dto };
      mockReservationModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn(() => updated),
      });
      const result = service.upsert(dto);
      return expect(result).resolves.toEqual(updated);
    });
  });

  describe('updateStatus', () => {
    it('should update status and return reservation', () => {
      mockReservationModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn(() => mockReservation),
      });
      const result = service.updateStatus('123', ReservationStatus.COMPLETED);
      return expect(result).resolves.toBe(mockReservation);
    });
  });

  describe('processReservation', () => {
    const baseDto: ReservationRowDto = {
      reservationId: '123',
      guestName: 'Jan Nowak',
      status: ReservationStatus.PENDING,
      checkInDate: '2024-05-01',
      checkOutDate: '2024-05-07',
    };

    it('should upsert if status is not CANCELLED or COMPLETED', async () => {
      const upserted = {
        ...mockReservation,
        ...baseDto,
        checkInDate: new Date(baseDto.checkInDate),
        checkOutDate: new Date(baseDto.checkOutDate),
      };
      const upsertSpy = jest
        .spyOn(service, 'upsert')
        .mockResolvedValue(upserted as unknown as ReservationDocument);
      const result = await service.processReservation(baseDto);
      expect(result).toBe(true);
      expect(upsertSpy).toHaveBeenCalledWith(baseDto);
      expect(loggerLogSpy).toHaveBeenCalledWith('Upserted reservation 123');
    });

    it('should update status if CANCELLED or COMPLETED and exists', async () => {
      const dto = { ...baseDto, status: ReservationStatus.CANCELLED };
      const findSpy = jest
        .spyOn(service, 'findByReservationId')
        .mockResolvedValue(mockReservation as unknown as ReservationDocument);
      const updateSpy = jest
        .spyOn(service, 'updateStatus')
        .mockResolvedValue(mockReservation as unknown as ReservationDocument);
      const result = await service.processReservation(dto);
      expect(result).toBe(true);
      expect(findSpy).toHaveBeenCalledWith('123');
      expect(updateSpy).toHaveBeenCalledWith(
        '123',
        ReservationStatus.CANCELLED,
      );
      expect(loggerLogSpy).toHaveBeenCalledWith(
        'Updated reservation 123 status to anulowana',
      );
    });

    it('should skip if CANCELLED or COMPLETED and not exists', async () => {
      const dto = { ...baseDto, status: ReservationStatus.COMPLETED };
      const findSpy = jest
        .spyOn(service, 'findByReservationId')
        .mockResolvedValue(null);
      const result = await service.processReservation(dto);
      expect(result).toBe(false);
      expect(findSpy).toHaveBeenCalledWith('123');
      expect(loggerLogSpy).toHaveBeenCalledWith(
        'Skipped reservation 123 - status zrealizowana but not in DB',
      );
    });
  });
});
