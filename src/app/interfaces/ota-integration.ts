import { Hotel } from './hotel'; // Giả sử bạn đã có interface Hotel
import { Room } from './rooms'; // Giả sử bạn đã có interface Room 

export type OtaProvider = 'Booking.com' | 'Agoda' | 'Traveloka' | 'Trip.com' | 'Expedia';
export const ALL_OTA_PROVIDERS: OtaProvider[] = ['Booking.com', 'Agoda', 'Traveloka', 'Trip.com', 'Expedia'];

export type OtaIntegrationStatus = 'active' | 'inactive' | 'error' | 'pending';

export interface OtaCredentials {
    // Common credentials
    username?: string;
    password?: string;
    hotelId?: string;
    propertyId?: string;
    apiKey?: string;
    apiSecret?: string;
    accessToken?: string;
    refreshToken?: string;
    tokenExpiresAt?: Date;
    
    // Agoda specific
    agodaPartnerId?: string;
    agodaApiKey?: string;
    
    // Traveloka specific
    travelokaClientId?: string;
    travelokaClientSecret?: string;
    
    // Trip.com specific
    tripClientId?: string;
    tripClientSecret?: string;
    tripPartnerCode?: string;
    
    // Expedia specific
    expediaApiKey?: string;
    expediaSecret?: string;
    expediaHotelId?: string;
}

export interface OtaSettings {
    autoAcceptBookings: boolean;
    updateInventory: boolean;
    updatePrices: boolean;
    updateAvailability: boolean;
    currencyCode: string;
    languageCode: string;
    // New settings
    autoSyncInterval: number; // in minutes
    notificationEmail: string;
    markupPercentage: number;
    minimumStay: number;
    maximumStay: number;
}

export interface CancellationPolicy {
    type: string; // free, percentage, fixed
    deadlineDays: number;
    penaltyAmount: number;
    penaltyPercentage?: number;
    description?: string;
}

export interface OtaRoomTypeMapping {
    _id?: string;
    localRoomTypeId: string | Room;
    otaRoomTypeId?: string;
    otaRoomTypeName?: string;
    maxOccupancy: number;
    baseRate: number;
    extraBedRate?: number;
    mealPlan?: string;
    amenities?: string[];
    photos?: string[];
    description?: string;
}

export interface OtaRatePlanMapping {
    _id?: string;
    localRatePlanId: string;
    otaRatePlanId?: string;
    otaRatePlanName?: string;
    mealPlan?: string;
    cancellationPolicy: CancellationPolicy;
    restrictions?: {
        minStay?: number;
        maxStay?: number;
        closedToArrival?: boolean;
        closedToDeparture?: boolean;
    };
}

export interface OtaMappings {
    roomTypes?: OtaRoomTypeMapping[];
    ratePlans?: OtaRatePlanMapping[];
}

export interface PropertyAddress {
    street: string;
    city: string;
    state?: string;
    country: string;
    postalCode: string;
    coordinates?: {
        latitude: number;
        longitude: number;
    };
}

export interface PropertyPolicies {
    checkInTime: string;
    checkOutTime: string;
    cancellationPolicy: string;
    childrenPolicy?: string;
    petPolicy?: string;
    paymentPolicy?: string;
}

export interface PropertyInfo {
    name: string;
    address: PropertyAddress;
    starRating: number;
    facilities: string[];
    policies: PropertyPolicies;
    description?: string;
    photos?: string[];
    amenities?: string[];
    contactInfo?: {
        phone?: string;
        email?: string;
        website?: string;
    };
}

export interface OtaErrorLog {
    timestamp: Date;
    message: string;
    code?: string;
    details?: any;
    provider: OtaProvider;
    severity: 'low' | 'medium' | 'high';
}

export interface OtaIntegration {
    _id: string;
    hotelId: string | Hotel;
    provider: OtaProvider;
    credentials?: OtaCredentials;
    status: OtaIntegrationStatus;
    lastSync?: Date;
    syncFrequency: number;
    settings: OtaSettings;
    mappings: {
        roomTypes: OtaRoomTypeMapping[];
        ratePlans: OtaRatePlanMapping[];
    };
    propertyInfo?: PropertyInfo;
    errorLog?: OtaErrorLog[];
    createdAt: Date;
    updatedAt: Date;
    metadata?: any;
}

export interface OtaBooking {
    otaBookingId: string;
    otaProvider: OtaProvider;
    guestName: string;
    checkInDate: Date;
    checkOutDate: Date;
    roomTypeName: string;
    totalAmount: number;
    currency: string;
    status: string;
    source: string;
    numberOfGuests: {
        adults: number;
        children: number;
        infants?: number;
    };
    guestDetails: {
        email?: string;
        phone?: string;
        nationality?: string;
        specialRequests?: string[];
        address?: string;
        passportNumber?: string;
    };
    paymentDetails: {
        method: string;
        status: string;
        totalPaid?: number;
        commission?: number;
        currency: string;
        cardType?: string;
        cardLastFourDigits?: string;
    };
    cancellationDetails?: {
        cancelledAt?: Date;
        reason?: string;
        refundAmount?: number;
        penaltyAmount?: number;
        status: string;
    };
    roomDetails: {
        roomTypeId: string;
        ratePlanId: string;
        quantity: number;
        pricePerNight: number;
        mealPlan?: string;
        specialRequests?: string[];
    }[];
} 