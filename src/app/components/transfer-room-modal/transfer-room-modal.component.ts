import { Component, Inject, OnInit, OnDestroy } from '@angular/core';
import { NzModalRef, NZ_MODAL_DATA } from 'ng-zorro-antd/modal';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RoomsService } from '../../services/rooms.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { Room } from '../../interfaces/rooms';
import { Subject } from 'rxjs';
import { take, takeUntil } from 'rxjs/operators';
import { SessionContextService } from '../../services/session-context.service';
import { AuthService } from '../../services/auth.service';
import { CheckinCacheService } from '../../services/checkin-cache.service';

@Component({
  selector: 'app-transfer-room-modal',
  templateUrl: './transfer-room-modal.component.html',
  styleUrls: ['./transfer-room-modal.component.css']
})
export class TransferRoomModalComponent implements OnInit, OnDestroy {
  transferForm!: FormGroup;
  sourceRoom!: Room;
  availableRooms: Room[] = [];
  isLoading = false;
  private destroy$ = new Subject<void>();

  constructor(
    @Inject(NZ_MODAL_DATA) public data: { 
      sourceRoom: Room;
      availableRooms: Room[];
    },
    private modalRef: NzModalRef,
    private fb: FormBuilder,
    private roomsService: RoomsService,
    private message: NzMessageService,
    private sessionContext: SessionContextService,
    private authService: AuthService,
    private checkinCache: CheckinCacheService
  ) {
    this.sourceRoom = data.sourceRoom;
    this.availableRooms = data.availableRooms || [];
  }

  ngOnInit(): void {
    this.initForm();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  initForm(): void {
    this.transferForm = this.fb.group({
      targetRoomId: ['', [Validators.required]],
      notes: ['']
    });
  }

  getStatusLabel(status: string): string {
    const labels: {[key: string]: string} = {
      'vacant': 'Trống',
      'occupied': 'Đang sử dụng',
      'dirty': 'Cần dọn dẹp',
      'cleaning': 'Đang dọn dẹp',
      'maintenance': 'Bảo trì',
      'booked': 'Đã đặt'
    };
    return labels[status] || status;
  }

  onSubmit(): void {
    if (this.transferForm.invalid) {
      this.message.warning('Vui lòng chọn phòng đích');
      return;
    }

    const targetRoomId = this.transferForm.get('targetRoomId')?.value;
    const notes = this.transferForm.get('notes')?.value?.trim() || 'Chuyển phòng';
    
    if (!targetRoomId) {
      this.message.warning('Vui lòng chọn phòng đích');
      return;
    }

    this.isLoading = true;
    
    // Lấy staffId từ session context
    const staffId = this.sessionContext.getStaffId() || this.authService.getUserId() || 'unknown';

    // Gọi API chuyển phòng
    this.roomsService.transferRoom(
      this.sourceRoom._id,
      targetRoomId,
      staffId,
      notes
    ).pipe(
      take(1),
      takeUntil(this.destroy$)
    ).subscribe(
      (response) => {
        this.isLoading = false;
        const targetRoom = response.targetRoom;
        const booking = response.booking;
        const checkinEvent = response.checkinEvent; // Thông tin check-in mới từ backend
        
        // Lưu thông tin checkin vào checkin cache cho phòng đích
        // Ưu tiên sử dụng thông tin từ response.checkinEvent (từ backend)
        if (checkinEvent && targetRoom?._id) {
          try {
            // Sử dụng thông tin từ backend (đầy đủ và chính xác nhất)
            const targetCheckinData = {
              checkinTime: checkinEvent.checkinTime,
              guestInfo: checkinEvent.guestInfo || {},
              rateType: checkinEvent.rateType || 'hourly',
              advancePayment: checkinEvent.advancePayment || 0,
              additionalCharges: checkinEvent.additionalCharges || 0,
              discount: checkinEvent.discount || 0,
              selectedServices: checkinEvent.selectedServices || [],
              paymentMethod: checkinEvent.paymentMethod || 'cash',
              expectedCheckoutTime: checkinEvent.expectedCheckoutTime,
              roomId: targetRoom._id,
              roomNumber: targetRoom.roomNumber,
              transferredFrom: checkinEvent.transferredFrom || this.sourceRoom._id,
              transferredFromRoomNumber: this.sourceRoom.roomNumber,
              transferredAt: checkinEvent.transferredAt || new Date()
            };
            // Lưu vào checkin cache cho phòng đích
            this.checkinCache.set(targetRoom._id, targetCheckinData);
            console.log('Saved checkin data from backend response:', targetCheckinData);
          } catch (e) {
            console.error('Error saving transfer checkin data from response:', e);
          }
        } else {
          // Fallback: Lấy thông tin từ phòng nguồn (nếu có trong checkin cache)
          const checkinData = this.checkinCache.getSync(this.sourceRoom._id);
          if (checkinData && targetRoom?._id) {
            try {
              // Cập nhật roomId và roomNumber cho phòng đích
              const targetCheckinData = {
                ...checkinData,
                roomId: targetRoom._id,
                roomNumber: targetRoom.roomNumber,
                transferredFrom: this.sourceRoom._id,
                transferredFromRoomNumber: this.sourceRoom.roomNumber,
                transferredAt: new Date()
              };
              // Lưu vào checkin cache cho phòng đích
              this.checkinCache.set(targetRoom._id, targetCheckinData);
              console.log('Saved checkin data from checkin cache fallback:', targetCheckinData);
            } catch (e) {
              console.error('Error saving transfer checkin data from checkin cache:', e);
            }
          }
        }
        
        // Xóa dữ liệu cũ của phòng nguồn
        this.checkinCache.remove(this.sourceRoom._id);
        
        // Tạo thông báo chi tiết
        let successMessage = `Đã chuyển từ phòng ${this.sourceRoom.roomNumber} sang phòng ${targetRoom?.roomNumber || 'N/A'}`;
        
        if (booking && booking.basePrice) {
          successMessage += `\nGiá phòng mới: ${booking.basePrice.toLocaleString('vi-VN')} VNĐ`;
        }
        
        this.message.success(successMessage);
        
        // QUAN TRỌNG: Thông báo cho room component để reload events cho cả phòng nguồn và phòng đích
        // Điều này đảm bảo thông tin từ phòng cũ được hiển thị đúng trên phòng mới
        // Delay một chút để đảm bảo backend đã lưu xong event mới vào RoomEvent collection
        // Tăng delay lên 500ms để đảm bảo backend đã hoàn tất việc:
        // 1. Tạo event checkin mới cho phòng đích
        // 2. Tạo checkout event cho phòng nguồn
        // 3. Cập nhật room status (phòng nguồn -> dirty, phòng đích -> occupied)
        setTimeout(() => {
          const sourceId = this.sourceRoom?._id;
          const targetId = response?.targetRoom?._id || this.transferForm?.get('targetRoomId')?.value;
          const hotelRaw = this.sourceRoom?.hotelId as any;
          const hotelId = typeof hotelRaw === 'string'
            ? hotelRaw
            : (hotelRaw?._id || this.sessionContext.getSelectedHotelId() || undefined);
          this.roomsService.notifyRoomDataUpdated({
            hotelId,
            roomId: sourceId,
            relatedRoomId: targetId,
            reason: 'transfer',
            refreshRooms: true,
            refreshHistory: true,
            force: false,
            delayMs: 0
          });
        }, 500);
        
        this.modalRef.close({ success: true, response });
      },
      (error) => {
        this.isLoading = false;
        console.error('Error transferring room:', error);
        const errorMessage = error.error?.details || error.error?.message || error.message || 'Vui lòng thử lại sau';
        this.message.error('Lỗi khi chuyển phòng: ' + errorMessage);
      }
    );
  }

  onCancel(): void {
    this.modalRef.close();
  }
}

