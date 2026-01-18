import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Blog } from '../components/blog-management/blog-management.component';
import { environment } from '../../environments/environment';

export interface BlogQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'draft' | 'published';
  category?: string;
}

export interface BlogResponse {
  blogs: Blog[];
  total: number;
  page: number;
  limit: number;
}

@Injectable({
  providedIn: 'root'
})
export class BlogService {
  private apiUrl = `${environment.apiUrl}/blogs`;

  constructor(private http: HttpClient) { }

  getBlogs(query?: BlogQuery): Observable<BlogResponse> {
    let params = new HttpParams();
    
    if (query?.page) {
      params = params.set('page', query.page.toString());
    }
    
    if (query?.limit) {
      params = params.set('limit', query.limit.toString());
    }
    
    if (query?.search) {
      params = params.set('search', query.search);
    }
    
    if (query?.status) {
      params = params.set('status', query.status);
    }
    
    if (query?.category) {
      params = params.set('category', query.category);
    }
    
    return this.http.get<BlogResponse>(this.apiUrl, { params });
  }

  getBlogById(id: string): Observable<Blog> {
    return this.http.get<Blog>(`${this.apiUrl}/${id}`);
  }

  createBlog(blog: Partial<Blog>): Observable<Blog> {
    return this.http.post<Blog>(this.apiUrl, blog);
  }

  updateBlog(id: string, blog: Partial<Blog>): Observable<Blog> {
    return this.http.put<Blog>(`${this.apiUrl}/${id}`, blog);
  }

  deleteBlog(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  // Public methods (không cần authentication)
  getPublicBlogs(query?: BlogQuery): Observable<BlogResponse> {
    let params = new HttpParams();
    
    if (query?.page) {
      params = params.set('page', query.page.toString());
    }
    
    if (query?.limit) {
      params = params.set('limit', query.limit.toString());
    }
    
    if (query?.search) {
      params = params.set('search', query.search);
    }
    
    if (query?.status) {
      params = params.set('status', query.status);
    }
    
    if (query?.category) {
      params = params.set('category', query.category);
    }
    
    return this.http.get<BlogResponse>(`${this.apiUrl}/public`, { params });
  }

  getPublicBlogById(id: string): Observable<Blog> {
    return this.http.get<Blog>(`${this.apiUrl}/public/${id}`);
  }

  incrementViews(id: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/public/${id}/views`, {});
  }

  likeBlog(id: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/public/${id}/like`, {});
  }

  dislikeBlog(id: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/public/${id}/dislike`, {});
  }
}

