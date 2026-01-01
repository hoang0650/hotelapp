import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ContactService, Contact, ContactQuery, ContactStats } from '../../services/contact.service';
import { AuthService } from '../../services/auth.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { TranslateService } from '@ngx-translate/core';

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

  statusOptions: { value: string; label: string; color: string }[] = [];

  constructor(
    private contactService: ContactService,
    public authService: AuthService,
    private message: NzMessageService,
    private modal: NzModalService,
    private fb: FormBuilder,
    private translate: TranslateService
  ) {
    this.replyForm = this.fb.group({
      replyMessage: ['', [Validators.required, Validators.minLength(10)]]
    });

    this.notesForm = this.fb.group({
      notes: ['']
    });
  }

  ngOnInit(): void {
    this.initStatusOptions();
    this.loadContacts();
    this.loadStats();
    this.translate.onLangChange.subscribe(() => {
      this.initStatusOptions();
    });
  }

  private initStatusOptions(): void {
    this.statusOptions = [
      { value: 'pending', label: this.translate.instant('CONTACT_MANAGEMENT.PENDING'), color: 'orange' },
      { value: 'read', label: this.translate.instant('CONTACT_MANAGEMENT.READ'), color: 'blue' },
      { value: 'replied', label: this.translate.instant('CONTACT_MANAGEMENT.REPLIED'), color: 'green' },
      { value: 'archived', label: this.translate.instant('CONTACT_MANAGEMENT.ARCHIVED'), color: 'default' }
    ];
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
        this.message.error(this.translate.instant('CONTACT_MANAGEMENT.LOAD_ERROR'));
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
        this.message.error(this.translate.instant('CONTACT_MANAGEMENT.LOAD_DETAIL_ERROR'));
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
        this.message.success(this.translate.instant('CONTACT_MANAGEMENT.REPLY_SUCCESS'));
        this.closeReplyModal();
        this.loadContacts();
        this.loadStats();
        this.isReplying = false;
      },
      error: (error) => {
        console.error('Error replying contact:', error);
        this.message.error(error.error?.error || this.translate.instant('CONTACT_MANAGEMENT.REPLY_ERROR'));
        this.isReplying = false;
      }
    });
  }

  updateStatus(contact: Contact, status: string): void {
    this.contactService.updateContactStatus(contact._id!, status).subscribe({
      next: (response) => {
        this.message.success(this.translate.instant('CONTACT_MANAGEMENT.UPDATE_STATUS_SUCCESS'));
        this.loadContacts();
        this.loadStats();
        if (this.selectedContact && this.selectedContact._id === contact._id) {
          this.selectedContact = response.contact;
        }
      },
      error: (error) => {
        console.error('Error updating status:', error);
        this.message.error(error.error?.error || this.translate.instant('CONTACT_MANAGEMENT.UPDATE_STATUS_ERROR'));
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
    if (option) {
      return option.label;
    }
    // Fallback nếu không tìm thấy trong options
    switch (status) {
      case 'pending':
        return this.translate.instant('CONTACT_MANAGEMENT.PENDING');
      case 'read':
        return this.translate.instant('CONTACT_MANAGEMENT.READ');
      case 'replied':
        return this.translate.instant('CONTACT_MANAGEMENT.REPLIED');
      case 'archived':
        return this.translate.instant('CONTACT_MANAGEMENT.ARCHIVED');
      default:
        return status;
    }
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

