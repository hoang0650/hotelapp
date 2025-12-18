import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ContactService, Contact, ContactQuery, ContactStats } from '../../services/contact.service';
import { AuthService } from '../../services/auth.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';

@Component({
  selector: 'app-contact-management',
  templateUrl: './contact-management.component.html',
  styleUrls: ['./contact-management.component.css']
})
export class ContactManagementComponent implements OnInit {
  contacts: Contact[] = [];
  isLoading = false;
  total = 0;
  pageIndex = 1;
  pageSize = 10;
  searchValue = '';
  selectedStatus: string | null = null;
  startDate: Date | null = null;
  endDate: Date | null = null;
  dateRange: [Date | null, Date | null] | null = null;
  
  // Stats
  stats: ContactStats = {
    total: 0,
    pending: 0,
    read: 0,
    replied: 0,
    archived: 0
  };

  // Modal states
  isDetailModalVisible = false;
  isReplyModalVisible = false;
  selectedContact: Contact | null = null;
  replyForm!: FormGroup;
  isReplying = false;
  notesForm!: FormGroup;
  isUpdatingNotes = false;

  statusOptions = [
    { value: 'pending', label: 'Chờ xử lý', color: 'orange' },
    { value: 'read', label: 'Đã đọc', color: 'blue' },
    { value: 'replied', label: 'Đã phản hồi', color: 'green' },
    { value: 'archived', label: 'Đã lưu trữ', color: 'default' }
  ];

  constructor(
    private contactService: ContactService,
    public authService: AuthService,
    private message: NzMessageService,
    private modal: NzModalService,
    private fb: FormBuilder
  ) {
    this.replyForm = this.fb.group({
      replyMessage: ['', [Validators.required, Validators.minLength(10)]]
    });

    this.notesForm = this.fb.group({
      notes: ['']
    });
  }

  ngOnInit(): void {
    this.loadContacts();
    this.loadStats();
  }

  get isAdmin(): boolean {
    const user = this.authService.getCurrentUser();
    return user?.role === 'admin' || user?.role === 'superadmin';
  }

  loadContacts(): void {
    this.isLoading = true;
    const query: ContactQuery = {
      page: this.pageIndex,
      limit: this.pageSize
    };

    if (this.selectedStatus) {
      query.status = this.selectedStatus as any;
    }

    if (this.searchValue) {
      query.search = this.searchValue;
    }

    if (this.startDate) {
      query.startDate = this.startDate.toISOString().split('T')[0];
    }

    if (this.endDate) {
      query.endDate = this.endDate.toISOString().split('T')[0];
    }

    this.contactService.getContacts(query).subscribe({
      next: (response) => {
        this.contacts = response.contacts;
        this.total = response.total;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading contacts:', error);
        this.message.error('Lỗi khi tải danh sách liên hệ');
        this.isLoading = false;
      }
    });
  }

  loadStats(): void {
    this.contactService.getContactStats().subscribe({
      next: (response) => {
        this.stats = response.stats;
      },
      error: (error) => {
        console.error('Error loading stats:', error);
      }
    });
  }

  onSearch(): void {
    this.pageIndex = 1;
    this.loadContacts();
  }

  onStatusChange(status: string | null): void {
    this.selectedStatus = status;
    this.pageIndex = 1;
    this.loadContacts();
  }

  onDateRangeChange(dates: [Date | null, Date | null] | null): void {
    if (dates && dates[0] && dates[1]) {
      this.startDate = dates[0];
      this.endDate = dates[1];
    } else {
      this.startDate = null;
      this.endDate = null;
    }
    this.pageIndex = 1;
    this.loadContacts();
  }

  onPageChange(page: number): void {
    this.pageIndex = page;
    this.loadContacts();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  onPageSizeChange(pageSize: number): void {
    this.pageSize = pageSize;
    this.pageIndex = 1;
    this.loadContacts();
  }

  viewDetail(contact: Contact): void {
    this.selectedContact = contact;
    this.notesForm.patchValue({ notes: contact.notes || '' });
    
    // Load chi tiết để đánh dấu đã đọc
    this.contactService.getContactById(contact._id!).subscribe({
      next: (response) => {
        this.selectedContact = response.contact;
        this.isDetailModalVisible = true;
        // Reload danh sách để cập nhật status
        this.loadContacts();
        this.loadStats();
      },
      error: (error) => {
        console.error('Error loading contact detail:', error);
        this.message.error('Lỗi khi tải chi tiết liên hệ');
      }
    });
  }

  closeDetailModal(): void {
    this.isDetailModalVisible = false;
    this.selectedContact = null;
  }

  openReplyModal(contact: Contact): void {
    this.selectedContact = contact;
    this.replyForm.reset();
    this.isReplyModalVisible = true;
  }

  closeReplyModal(): void {
    this.isReplyModalVisible = false;
    this.selectedContact = null;
    this.replyForm.reset();
  }

  submitReply(): void {
    if (this.replyForm.invalid || !this.selectedContact?._id) {
      Object.values(this.replyForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity({ onlySelf: true });
        }
      });
      return;
    }

    this.isReplying = true;
    const replyMessage = this.replyForm.value.replyMessage;

    this.contactService.replyContact(this.selectedContact._id, replyMessage).subscribe({
      next: (response) => {
        this.message.success('Phản hồi liên hệ thành công');
        this.closeReplyModal();
        this.loadContacts();
        this.loadStats();
        this.isReplying = false;
      },
      error: (error) => {
        console.error('Error replying contact:', error);
        this.message.error(error.error?.error || 'Lỗi khi phản hồi liên hệ');
        this.isReplying = false;
      }
    });
  }

  updateStatus(contact: Contact, status: string): void {
    this.contactService.updateContactStatus(contact._id!, status).subscribe({
      next: (response) => {
        this.message.success('Cập nhật trạng thái thành công');
        this.loadContacts();
        this.loadStats();
        if (this.selectedContact && this.selectedContact._id === contact._id) {
          this.selectedContact = response.contact;
        }
      },
      error: (error) => {
        console.error('Error updating status:', error);
        this.message.error(error.error?.error || 'Lỗi khi cập nhật trạng thái');
      }
    });
  }

  updateNotes(): void {
    if (!this.selectedContact?._id) return;

    this.isUpdatingNotes = true;
    const notes = this.notesForm.value.notes;

    this.contactService.updateContactStatus(this.selectedContact._id, this.selectedContact.status || 'pending', notes).subscribe({
      next: (response) => {
        this.message.success('Cập nhật ghi chú thành công');
        this.selectedContact = response.contact;
        this.isUpdatingNotes = false;
      },
      error: (error) => {
        console.error('Error updating notes:', error);
        this.message.error(error.error?.error || 'Lỗi khi cập nhật ghi chú');
        this.isUpdatingNotes = false;
      }
    });
  }

  deleteContact(contact: Contact): void {
    this.modal.confirm({
      nzTitle: 'Xác nhận xóa',
      nzContent: `Bạn có chắc muốn xóa liên hệ từ "${contact.name}"?`,
      nzOkText: 'Xóa',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzCancelText: 'Hủy',
      nzOnOk: () => {
        this.contactService.deleteContact(contact._id!).subscribe({
          next: () => {
            this.message.success('Xóa liên hệ thành công');
            this.loadContacts();
            this.loadStats();
            if (this.selectedContact && this.selectedContact._id === contact._id) {
              this.closeDetailModal();
            }
          },
          error: (error) => {
            console.error('Error deleting contact:', error);
            this.message.error(error.error?.error || 'Lỗi khi xóa liên hệ');
          }
        });
      }
    });
  }

  getStatusLabel(status: string): string {
    const option = this.statusOptions.find(opt => opt.value === status);
    return option ? option.label : status;
  }

  getStatusColor(status: string): string {
    const option = this.statusOptions.find(opt => opt.value === status);
    return option ? option.color : 'default';
  }

  formatDate(date: Date | string | undefined): string {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}

