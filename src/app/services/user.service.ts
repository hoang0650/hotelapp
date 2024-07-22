import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map, BehaviorSubject } from 'rxjs';
import { User } from '../interfaces/users';
@Injectable({
  providedIn: 'root'
})
export class UserService {
  private headers = new HttpHeaders({ 'Content-Type': 'application/json', 'charset': 'UTF-8' })
  private options = { headers: this.headers }
  private apiUrl = 'https://hotel-app-smp2.onrender.com/users'
  public loggedIn = new BehaviorSubject<boolean>(false);
  constructor(private http: HttpClient) { 
    // this.checkToken();
  }

   // Hàm này kiểm tra token và cập nhật trạng thái đăng nhập
   private checkToken(): void {
    const token = localStorage.getItem('access_token');
    const isLoggedIn = !!token; // Kiểm tra xem token có tồn tại không

    this.loggedIn.next(isLoggedIn);
  }

  get isLoggedIn(): Observable<boolean>{
    return this.loggedIn.asObservable();
  }


  //1. sử dụng kiểu any
  // signUp(userData: any): Observable<any>{
  //   return this.http.post(`${this.apiUrl}/signup`,userData);
  // }

  //2. sử dụng interface
  signUp(userData: User): Observable<User>{
    return this.http.post<User>(`${this.apiUrl}/signup`,userData);
  }
  
  register(user: any): Observable<any> {
    return this.http.post('/api/user', JSON.stringify(user), this.options)
  }

  // 1. login with JSON
  // login(credentials: any): Observable<any> {
  //   return this.http.post('/api/login', JSON.stringify(credentials), this.options)
  // }

//   login(emailAndPassword:any){
//     return this.userService.login(emailAndPassword).subscribe(res=>{
//       localStorage.setItem('access_token',res.token);
//       const decodedUser = this.decodedUserFromToken(res.token);
//       this.setCurrentUser(decodedUser);
//       return this.loggedIn;
//     })
//  }

  login(userData:any): Observable<any>{
    // this.loggedIn.next(true)
    return this.http.post<User>(`${this.apiUrl}/login`,userData);
  }

  logout(): void {
    return this.loggedIn.next(false)
  }
  

  // getUsers(): Observable<any> {
  //   return this.http.get('/api/users').pipe(map((res: any) => { return res.JSON() }))
  // }

  // getUserInfor(): Observable <any>{
  //   const token = localStorage.getItem('access_token')
  //   const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`)
  //   return this.http.get<any>(`${this.apiUrl}/info`, { headers });
  // }

  countUsers(): Observable<any>{
    return this.http.get('/api/users/count').pipe(map((res:any)=>{return res.JSON()}))
  }

  addUser(user:any):Observable<any>{
    return this.http.post('/api/user', JSON.stringify(user), this.options)
  }

  getUser(user:any): Observable<any>{
    return this.http.get(`/api/user/${user._id}`).pipe(map((res:any)=>{return res.JSON()}))
  }

  editUser(user:any):Observable<any>{
    return this.http.put(`/api/user/${user._id}`, JSON.stringify(user), this.options)
  }

  deleteUser(user:any): Observable<any>{
    return this.http.delete(`/api/user/${user._id}`, this.options)
  }

}
