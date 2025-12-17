import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { BlogService } from '../../services/blog.service';
import { AuthService } from '../../services/auth.service';
import { User } from '../../interfaces/user';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';

export interface Blog {
  _id?: string;
  title: string;
  content: string;
  excerpt?: string;
  authorId?: string;
  authorName?: string;
  status: 'draft' | 'published';
  featuredImage?: string;
  tags?: string[];
  category?: string;
  views?: number;
  likesCount?: number;
  dislikesCount?: number;
  userLiked?: boolean;
  userDisliked?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

@Component({
  selector: 'app-blog-management',
  templateUrl: './blog-management.component.html',
  styleUrls: ['./blog-management.component.css']
})
export class BlogManagementComponent implements OnInit {
  blogForm: FormGroup;
  blogs: Blog[] = [];
  editId: string | null = null;
  selectedBlog: Blog | null = null;
  isLoading = false;
  isModalVisible = false;
  currentUser: User | null = null;
  pageIndex = 1;
  pageSize = 10;
  total = 0;
  searchValue = '';
  statusFilter: 'all' | 'draft' | 'published' = 'all';

  get isSuperAdmin(): boolean {
    return this.authService.isSuperAdmin();
  }

  get isAdmin(): boolean {
    return this.authService.isAdmin();
  }

  get canAccess(): boolean {
    return this.isSuperAdmin || this.isAdmin;
  }

  get canDelete(): boolean {
    return this.isSuperAdmin; // Chỉ superadmin mới được xóa
  }

  constructor(
    private fb: FormBuilder,
    private blogService: BlogService,
    public authService: AuthService,
    private message: NzMessageService,
    private modal: NzModalService
  ) {
    this.blogForm = this.fb.group({
      title: ['', [Validators.required, Validators.maxLength(200)]],
      content: ['', [Validators.required]],
      excerpt: ['', [Validators.maxLength(500)]],
      status: ['draft', Validators.required],
      featuredImage: [''],
      tags: [[]],
      category: ['']
    });
  }

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    if (!this.canAccess) {
      this.message.error('Bạn không có quyền truy cập trang này');
      return;
    }
    this.loadBlogs();
  }

  loadBlogs(): void {
    this.isLoading = true;
    const query: any = {
      page: this.pageIndex,
      limit: this.pageSize
    };

    if (this.searchValue) {
      query.search = this.searchValue;
    }

    if (this.statusFilter !== 'all') {
      query.status = this.statusFilter;
    }

    this.blogService.getBlogs(query).subscribe({
      next: (response: any) => {
        this.blogs = response.blogs || response.data || [];
        this.total = response.total || 0;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Lỗi khi tải danh sách blog:', error);
        this.message.error(error.error?.message || 'Không thể tải danh sách blog');
        this.isLoading = false;
      }
    });
  }

  openCreateModal(): void {
    this.editId = null;
    this.selectedBlog = null;
    this.blogForm.reset({
      title: '',
      content: '',
      excerpt: '',
      status: 'draft',
      featuredImage: '',
      tags: [],
      category: ''
    });
    this.isModalVisible = true;
  }

  openEditModal(blog: Blog): void {
    this.editId = blog._id || null;
    this.selectedBlog = blog;
    // Chuyển tags array thành string để hiển thị trong input
    const tagsString = blog.tags && blog.tags.length > 0 ? blog.tags.join(', ') : '';
    
    this.blogForm.patchValue({
      title: blog.title,
      content: blog.content,
      excerpt: blog.excerpt || '',
      status: blog.status,
      featuredImage: blog.featuredImage || '',
      tags: tagsString,
      category: blog.category || ''
    });
    this.isModalVisible = true;
  }

  handleCancel(): void {
    this.isModalVisible = false;
    this.editId = null;
    this.selectedBlog = null;
    this.blogForm.reset();
  }

  handleOk(): void {
    if (this.blogForm.invalid) {
      this.message.warning('Vui lòng điền đầy đủ thông tin bắt buộc');
      Object.values(this.blogForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity({ onlySelf: true });
        }
      });
      return;
    }

    const formValue = this.blogForm.value;
    
    // Xử lý tags nếu là string (phân cách bằng dấu phẩy)
    let tagsArray: string[] = [];
    if (formValue.tags) {
      if (typeof formValue.tags === 'string') {
        tagsArray = formValue.tags.split(',').map((tag: string) => tag.trim()).filter((tag: string) => tag.length > 0);
      } else if (Array.isArray(formValue.tags)) {
        tagsArray = formValue.tags;
      }
    }
    
    const blogData: Blog = {
      title: formValue.title,
      content: formValue.content,
      excerpt: formValue.excerpt,
      status: formValue.status,
      featuredImage: formValue.featuredImage,
      tags: tagsArray,
      category: formValue.category
    };

    this.isLoading = true;

    if (this.editId) {
      this.blogService.updateBlog(this.editId, blogData).subscribe({
        next: (updatedBlog) => {
          this.message.success('Đã cập nhật bài viết thành công');
          this.loadBlogs();
          this.handleCancel();
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Lỗi khi cập nhật blog:', error);
          this.message.error(error.error?.message || 'Không thể cập nhật bài viết');
          this.isLoading = false;
        }
      });
    } else {
      this.blogService.createBlog(blogData).subscribe({
        next: (newBlog) => {
          this.message.success('Đã tạo bài viết thành công');
          this.loadBlogs();
          this.handleCancel();
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Lỗi khi tạo blog:', error);
          this.message.error(error.error?.message || 'Không thể tạo bài viết');
          this.isLoading = false;
        }
      });
    }
  }

  deleteBlog(id: string): void {
    if (!this.canDelete) {
      this.message.error('Bạn không có quyền xóa bài viết');
      return;
    }

    this.modal.confirm({
      nzTitle: 'Xác nhận xóa',
      nzContent: 'Bạn có chắc chắn muốn xóa bài viết này?',
      nzOkText: 'Xóa',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzCancelText: 'Hủy',
      nzOnOk: () => {
        this.isLoading = true;
        this.blogService.deleteBlog(id).subscribe({
          next: () => {
            this.message.success('Đã xóa bài viết thành công');
            this.loadBlogs();
            this.isLoading = false;
          },
          error: (error) => {
            console.error('Lỗi khi xóa blog:', error);
            this.message.error(error.error?.message || 'Không thể xóa bài viết');
            this.isLoading = false;
          }
        });
      }
    });
  }

  onSearch(): void {
    this.pageIndex = 1;
    this.loadBlogs();
  }

  onPageChange(page: number): void {
    this.pageIndex = page;
    this.loadBlogs();
  }

  onPageSizeChange(size: number): void {
    this.pageSize = size;
    this.pageIndex = 1;
    this.loadBlogs();
  }

  onStatusFilterChange(status: 'all' | 'draft' | 'published'): void {
    this.statusFilter = status;
    this.pageIndex = 1;
    this.loadBlogs();
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'published':
        return 'Đã xuất bản';
      case 'draft':
        return 'Bản nháp';
      default:
        return status;
    }
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'published':
        return 'success';
      case 'draft':
        return 'default';
      default:
        return 'default';
    }
  }

  formatDate(date: Date | string | undefined): string {
    if (!date) return '-';
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

