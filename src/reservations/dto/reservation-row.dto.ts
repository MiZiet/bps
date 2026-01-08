import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsDateString,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { ReservationStatus } from '../schemas/reservation.schema';

@ValidatorConstraint({ name: 'isCheckOutAfterCheckIn', async: false })
export class IsCheckOutAfterCheckIn implements ValidatorConstraintInterface {
  validate(checkOutDate: string, args: ValidationArguments): boolean {
    const obj = args.object as ReservationRowDto;
    if (!obj.checkInDate || !checkOutDate) return true;

    const checkIn = new Date(obj.checkInDate);
    const checkOut = new Date(checkOutDate);
    return checkOut > checkIn;
  }

  defaultMessage(): string {
    return 'Check-out date must be after check-in date';
  }
}

export class ReservationRowDto {
  @IsString({ message: 'Reservation ID must be a string' })
  @IsNotEmpty({ message: 'Missing reservation ID' })
  reservationId: string;

  @IsString({ message: 'Guest name must be a string' })
  @IsNotEmpty({ message: 'Missing guest name' })
  guestName: string;

  @IsEnum(ReservationStatus, { message: 'Invalid reservation status' })
  @IsNotEmpty({ message: 'Missing reservation status' })
  status: ReservationStatus;

  @IsDateString({}, { message: 'Invalid check-in date format' })
  @IsNotEmpty({ message: 'Missing check-in date' })
  checkInDate: string;

  @IsDateString({}, { message: 'Invalid check-out date format' })
  @IsNotEmpty({ message: 'Missing check-out date' })
  @Validate(IsCheckOutAfterCheckIn)
  checkOutDate: string;
}
