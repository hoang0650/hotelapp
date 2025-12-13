import { Component, Inject, OnInit, OnDestroy } from '@angular/core';
import { NzModalRef, NZ_MODAL_DATA } from 'ng-zorro-antd/modal';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RoomsService } from '../../services/rooms.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { Room } from '../../interfaces/rooms';
import { Subject } from 'rxjs';
import { take, takeUntil } from 'rxjs/operators';

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
    private message: NzMessageService
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
    
    // Lấy staffId từ localStorage
    const staffId = localStorage.getItem('staffId') || localStorage.getItem('userId') || 'unknown';

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
        
        // Lưu thông tin checkin vào localStorage cho phòng đích
        // Lấy thông tin từ phòng nguồn (nếu có trong localStorage)
        const sourceCheckinData = localStorage.getItem(`checkin_${this.sourceRoom._id}`);
        if (sourceCheckinData && targetRoom?._id) {
          try {
            const checkinData = JSON.parse(sourceCheckinData);
            // Cập nhật roomId và roomNumber cho phòng đích
            const targetCheckinData = {
              ...checkinData,
              roomId: targetRoom._id,
              roomNumber: targetRoom.roomNumber,
              transferredFrom: this.sourceRoom._id,
              transferredFromRoomNumber: this.sourceRoom.roomNumber,
              transferredAt: new Date()
            };
            // Lưu vào localStorage cho phòng đích
            localStorage.setItem(`checkin_${targetRoom._id}`, JSON.stringify(targetCheckinData));
            // Xóa dữ liệu cũ của phòng nguồn
            localStorage.removeItem(`checkin_${this.sourceRoom._id}`);
          } catch (e) {
            console.error('Error saving transfer checkin data:', e);
          }
        }
        
        // Tạo thông báo chi tiết
        let successMessage = `Đã chuyển từ phòng ${this.sourceRoom.roomNumber} sang phòng ${targetRoom?.roomNumber || 'N/A'}`;
        
        if (booking && booking.basePrice) {
          successMessage += `\nGiá phòng mới: ${booking.basePrice.toLocaleString('vi-VN')} VNĐ`;
        }
        
        this.message.success(successMessage);
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

