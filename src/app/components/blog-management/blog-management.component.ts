import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { BlogService } from '../../services/blog.service';
import { AuthService } from '../../services/auth.service';
import { User } from '../../interfaces/user';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { NzUploadFile, NzUploadChangeParam } from 'ng-zorro-antd/upload';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { TranslateService } from '@ngx-translate/core';
import { environment } from '../../../environments/environment';

export interface BlogSection {
  title: string;
  content: string;
}

export interface Blog {
  _id?: string;
  title: string;
  content: string;
  sections?: BlogSection[];
  excerpt?: string;
  authorId?: string;
  authorName?: string;
  status: 'draft' | 'published';
  featuredImage?: string;
  imageUrl?: string;
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
  imageUrl: string | ArrayBuffer | null = '';
  fileList: any[] = [];
  apiBaseUrl = environment.apiUrl;
  uploadUrl = `${this.apiBaseUrl}/files/upload`;
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
    private modal: NzModalService,
    private http: HttpClient,
    private translate: TranslateService
  ) {
    this.blogForm = this.fb.group({
      title: ['', [Validators.required, Validators.maxLength(200)]],
      content: ['', [Validators.required]],
      excerpt: ['', [Validators.maxLength(500)]],
      status: ['draft', Validators.required],
      featuredImage: [''],
      imageUrl: [''],
      tags: [[]],
      category: [''],
      sections: this.fb.array([])
    });
  }

  get sections(): FormArray {
    return this.blogForm.get('sections') as FormArray;
  }

  get isEditMode(): boolean {
    return !!this.editId;
  }

  get uploadHeaders(): { [key: string]: string } {
    const token = this.authService.getToken();
    return {
      'Authorization': token || ''
    };
  }

  addSection(): void {
    const sectionForm = this.fb.group({
      title: ['', Validators.required],
      content: ['', Validators.required]
    });
    this.sections.push(sectionForm);
  }

  removeSection(index: number): void {
    this.sections.removeAt(index);
  }

  resetForm(): void {
    this.imageUrl = '';
    this.fileList = [];
    this.blogForm.reset({
      title: '',
      content: '',
      excerpt: '',
      status: 'draft',
      featuredImage: '',
      imageUrl: '',
      tags: [],
      category: ''
    });
    // Xóa tất cả sections
    while (this.sections.length !== 0) {
      this.sections.removeAt(0);
    }
    this.handleCancel();
  }

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    if (!this.canAccess) {
      this.message.error(this.translate.instant('BLOG_MANAGEMENT.NO_ACCESS'));
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
        this.message.error(error.error?.message || this.translate.instant('BLOG_MANAGEMENT.LOAD_ERROR'));
        this.isLoading = false;
      }
    });
  }

  openCreateModal(): void {
    this.editId = null;
    this.selectedBlog = null;
    this.imageUrl = '';
    this.fileList = [];
    this.blogForm.reset({
      title: '',
      content: '',
      excerpt: '',
      status: 'draft',
      featuredImage: '',
      imageUrl: '',
      tags: [],
      category: ''
    });
    // Xóa tất cả sections
    while (this.sections.length !== 0) {
      this.sections.removeAt(0);
    }
    // Thêm 1 section mặc định
    this.addSection();
    this.isModalVisible = true;
  }

  openEditModal(blog: Blog): void {
    this.editId = blog._id || null;
    this.selectedBlog = blog;
    // Chuyển tags array thành string để hiển thị trong input
    const tagsString = blog.tags && blog.tags.length > 0 ? blog.tags.join(', ') : '';
    
    // Set imageUrl preview
    const imageUrlValue = blog.imageUrl || blog.featuredImage || '';
    this.imageUrl = imageUrlValue;
    this.fileList = [];
    
    // Xóa tất cả sections cũ
    while (this.sections.length !== 0) {
      this.sections.removeAt(0);
    }
    
    // Load sections từ blog hoặc tạo section mặc định từ content
    if (blog.sections && blog.sections.length > 0) {
      blog.sections.forEach(section => {
        const sectionForm = this.fb.group({
          title: [section.title || '', Validators.required],
          content: [section.content || '', Validators.required]
        });
        this.sections.push(sectionForm);
      });
    } else if (blog.content) {
      // Nếu không có sections, tạo 1 section từ content cũ
      const sectionForm = this.fb.group({
        title: ['', Validators.required],
        content: [blog.content || '', Validators.required]
      });
      this.sections.push(sectionForm);
    } else {
      // Nếu không có gì, thêm 1 section trống
      this.addSection();
    }
    
    this.blogForm.patchValue({
      title: blog.title,
      content: blog.content,
      excerpt: blog.excerpt || '',
      status: blog.status,
      featuredImage: blog.featuredImage || '',
      imageUrl: imageUrlValue,
      tags: tagsString,
      category: blog.category || ''
    });
    this.isModalVisible = true;
  }

  handleCancel(): void {
    this.isModalVisible = false;
    this.editId = null;
    this.selectedBlog = null;
    this.imageUrl = '';
    this.fileList = [];
    this.blogForm.reset({
      title: '',
      content: '',
      excerpt: '',
      status: 'draft',
      featuredImage: '',
      imageUrl: '',
      tags: [],
      category: ''
    });
    // Xóa tất cả sections
    while (this.sections.length !== 0) {
      this.sections.removeAt(0);
    }
  }

  handleOk(): void {
    if (this.blogForm.invalid) {
      this.message.warning(this.translate.instant('BLOG_MANAGEMENT.FILL_REQUIRED'));
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
    
    // Lấy sections từ formArray
    const sections: BlogSection[] = this.sections.controls.map(control => ({
      title: control.get('title')?.value || '',
      content: control.get('content')?.value || ''
    }));
    
    // Tạo content từ sections (nối tất cả sections lại)
    const contentFromSections = sections.map(s => {
      if (s.title) {
        return `<h2>${s.title}</h2>${s.content}`;
      }
      return s.content;
    }).join('<br><br>');
    
    // Sử dụng content từ sections nếu có, nếu không dùng content cũ
    const finalContent = sections.length > 0 ? contentFromSections : formValue.content;
    
    const blogData: Blog = {
      title: formValue.title,
      content: finalContent,
      sections: sections.length > 0 ? sections : undefined,
      excerpt: formValue.excerpt,
      status: formValue.status,
      featuredImage: formValue.imageUrl || formValue.featuredImage,
      imageUrl: formValue.imageUrl || formValue.featuredImage,
      tags: tagsArray,
      category: formValue.category
    };

    this.isLoading = true;

    if (this.editId) {
      this.blogService.updateBlog(this.editId, blogData).subscribe({
        next: (updatedBlog) => {
          this.message.success(this.translate.instant('BLOG_MANAGEMENT.UPDATE_SUCCESS'));
          this.loadBlogs();
          this.handleCancel();
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Lỗi khi cập nhật blog:', error);
          this.message.error(error.error?.message || this.translate.instant('BLOG_MANAGEMENT.UPDATE_ERROR'));
          this.isLoading = false;
        }
      });
    } else {
      this.blogService.createBlog(blogData).subscribe({
        next: (newBlog) => {
          this.message.success(this.translate.instant('BLOG_MANAGEMENT.CREATE_SUCCESS'));
          this.loadBlogs();
          this.handleCancel();
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Lỗi khi tạo blog:', error);
          this.message.error(error.error?.message || this.translate.instant('BLOG_MANAGEMENT.CREATE_ERROR'));
          this.isLoading = false;
        }
      });
    }
  }

  deleteBlog(id: string): void {
    if (!this.canDelete) {
      this.message.error(this.translate.instant('BLOG_MANAGEMENT.NO_DELETE_PERMISSION'));
      return;
    }

    this.modal.confirm({
      nzTitle: this.translate.instant('BLOG_MANAGEMENT.CONFIRM_DELETE_TITLE'),
      nzContent: this.translate.instant('BLOG_MANAGEMENT.CONFIRM_DELETE_MESSAGE'),
      nzOkText: this.translate.instant('BLOG_MANAGEMENT.DELETE'),
      nzOkType: 'primary',
      nzOkDanger: true,
      nzCancelText: this.translate.instant('COMMON.CANCEL'),
      nzOnOk: () => {
        this.isLoading = true;
        this.blogService.deleteBlog(id).subscribe({
          next: () => {
            this.message.success(this.translate.instant('BLOG_MANAGEMENT.DELETE_SUCCESS'));
            this.loadBlogs();
            this.isLoading = false;
          },
          error: (error) => {
            console.error('Lỗi khi xóa blog:', error);
            this.message.error(error.error?.message || this.translate.instant('BLOG_MANAGEMENT.DELETE_ERROR'));
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
        return this.translate.instant('BLOG_MANAGEMENT.PUBLISHED');
      case 'draft':
        return this.translate.instant('BLOG_MANAGEMENT.DRAFT');
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

  handleImageChange(info: NzUploadChangeParam): void {
    if (info.file.status === 'uploading') {
      this.isLoading = true;
      return;
    }
    
    if (info.file.status === 'done') {
      // Xử lý khi upload thành công từ backend
      if (info.file.response) {
        const response = info.file.response;
        const imageId = response.imageId;
        const imageUrl = response.imageUrl || `${this.apiBaseUrl}/files/${imageId}`;
        
        this.imageUrl = imageUrl;
        this.blogForm.patchValue({
          imageUrl: imageUrl,
          featuredImage: imageUrl
        });
        this.message.success('Tải lên hình ảnh thành công');
      }
      this.isLoading = false;
    } else if (info.file.status === 'error') {
      this.message.error(`Lỗi khi tải lên hình ảnh: ${info.file.error?.message || 'Không xác định'}`);
      console.error('Upload error:', info.file.error);
      this.isLoading = false;
    }
  }

  beforeUpload = (file: NzUploadFile): boolean => {
    const isImage = file.type?.startsWith('image/');
    if (!isImage) {
      this.message.error('Bạn chỉ có thể tải lên file hình ảnh!');
      return false;
    }
    const isLt5M = (file.size || 0) / 1024 / 1024 < 5;
    if (!isLt5M) {
      this.message.error('Hình ảnh phải nhỏ hơn 5MB!');
      return false;
    }
    this.fileList = this.fileList.concat(file);
    return true;
  };

  getImageUrl(urlOrId: string): string {
    if (!urlOrId) return '';
    // Nếu là URL đầy đủ (http/https), trả về nguyên
    if (urlOrId.startsWith('http://') || urlOrId.startsWith('https://')) {
      return urlOrId;
    }
    // Nếu là imageId hoặc path, thêm base URL
    if (urlOrId.startsWith('/files/')) {
      return `${this.apiBaseUrl}${urlOrId}`;
    }
    // Nếu chỉ là ID, thêm /files/ prefix
    return `${this.apiBaseUrl}/files/${urlOrId}`;
  }

  handleImageError(event: any): void {
    // Nếu ảnh không load được, có thể là imageId cũ hoặc URL không hợp lệ
    console.warn('Image load error:', event);
  }
}

