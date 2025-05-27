import { Hotel } from './hotel'; // Giả sử bạn đã có interface Hotel
import { Room } from './rooms'; // Giả sử bạn đã có interface Room 

export type OtaProvider = 'Booking.com' | 'Agoda' | 'Traveloka' | 'Trip.com' | 'Expedia' | 'Other';
export const ALL_OTA_PROVIDERS: OtaProvider[] = ['Booking.com', 'Agoda', 'Traveloka', 'Trip.com', 'Expedia', 'Other'];

export type OtaIntegrationStatus = 'active' | 'inactive' | 'error';

export interface OtaCredentials {
    apiKey?: string;
    apiSecret?: string;
    username?: string;
    password?: string;
    hotelCode?: string; // Thường là hotelId trên OTA, hoặc một mã property riêng
    propertyCode?: string;
    // Thêm các trường credentials khác tùy OTA
}

export interface OtaSettings {
    autoAcceptBookings?: boolean;
    updateInventory?: boolean;
    updatePrices?: boolean;
    updateAvailability?: boolean;
}

export interface OtaRoomTypeMapping {
    _id?: string; // ID của mapping này (nếu có)
    localRoomTypeId: string | Room; // ID của RoomType trong hệ thống của bạn
    otaRoomTypeId?: string; // ID của RoomType trên OTA
    otaRoomTypeName?: string; // Tên RoomType trên OTA (để hiển thị)
}

export interface OtaRatePlanMapping {
    _id?: string;
    localRatePlanId: string; // ID của RatePlan trong hệ thống của bạn (cần định nghĩa interface RatePlan nếu chưa có)
    otaRatePlanId?: string;
    otaRatePlanName?: string;
}

export interface OtaMappings {
    roomTypes?: OtaRoomTypeMapping[];
    ratePlans?: OtaRatePlanMapping[];
}

export interface OtaErrorLog {
    timestamp: Date;
    message: string;
    code?: string;
    details?: any;
}

export interface OtaIntegration {
    _id: string;
    hotelId: string | Hotel;
    provider: OtaProvider;
    credentials?: OtaCredentials;
    status: OtaIntegrationStatus;
    lastSync?: Date;
    syncFrequency?: number; // in minutes
    settings?: OtaSettings;
    mappings?: OtaMappings;
    errorLog?: OtaErrorLog[];
    createdAt: Date;
    updatedAt: Date;
    metadata?: any;
}

// Interface cho dữ liệu đặt phòng mẫu từ OTA (dựa trên controller backend)
export interface OtaBooking {
    otaBookingId: string;
    guestName: string;
    checkInDate: string | Date;
    checkOutDate: string | Date;
    roomTypeName: string;
    totalAmount: number;
    currency: string;
    status: string; // 'Confirmed', 'Cancelled', etc.
    source: string; // Tên OTA provider
    // Thêm các trường khác nếu API OTA thực tế trả về
    numberOfGuests?: number;
    notes?: string;
} 