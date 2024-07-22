import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable,of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ApiService } from './api.service';
import { HttpClient } from '@angular/common/http';
import { RoomsService } from './rooms.service';

@Injectable({
  providedIn: 'root'
})
export class ProductService {

  private productsSource = new BehaviorSubject<any[]>([]);
  products$ = this.productsSource.asObservable()
  // products$ = this.apiService.loadData<any>('rooms');

  constructor(private apiService: ApiService, private http: HttpClient, private roomService: RoomsService) {
    // Mô phỏng việc tải dữ liệu từ server
    this.loadProducts();
  }

  private loadProducts() {
    // Cách 1: Data Set Cứng
    // Giả sử có một API hoặc dữ liệu từ server
    // const fakeServerData = [
    //   { id: 1, name: 'Product 1', description: 'Description 1' },
    //   { id: 2, name: 'Product 2', description: 'Description 2' },
    //   { id: 3, name: 'Product 3', description: 'Description 3' },
    //   { id: 4, name: 'Product 1', description: 'Description 4' },
    //   { id: 5, name: 'Product 2', description: 'Description 5' },
    //   { id: 6, name: 'Product 3', description: 'Description 6' },
    //   { id: 7, name: 'Product 1', description: 'Description 7' },
    //   { id: 8, name: 'Product 2', description: 'Description 8' },
     
    // ];


    // Cập nhật dữ liệu trong BehaviorSubject
    // this.productsSource.next(fakeServerData);
    
    // Cách 2: Lấy data từ api
    // Gọi API để lấy dữ liệu sản phẩm
    //  this.http.get<any[]>('http://localhost:3000/rooms').subscribe(
    //   data => {
    //     this.productsSource.next(data);
    //   },
    //   error => {
    //     console.error('Error loading products:', error);
    //   }
    // );
    this.roomService.getRooms().subscribe(
      data =>{
        this.productsSource.next(data)
      },
      error =>{
        console.error('Error loading products:', error)
      }
      
    )
    
  }

  loadUpdatedData() {
    this.loadProducts();
  }
  
  // updateProducts(newData: any[]): void {
  //   this.productsSource.next(newData);
  // }

  updateProducts(updatedProduct: any): Observable<any> {
    const currentProducts = this.productsSource.value;

    // Find the index of the product in the local array
    const index = currentProducts.findIndex(product => product.roomNumber === updatedProduct.roomNumber);

    if (index !== -1) {
      // Update the local array
      const updatedProducts = [...currentProducts];
      updatedProducts[index] = { ...updatedProduct };
      this.productsSource.next(updatedProducts);
      // Update the product in the API
      return this.http.put<any>('https://hotel-app-smp2.onrender.com/checkin' + updatedProduct.roomNumber, updatedProduct)
      .pipe(
        catchError(error => {
          console.error('Error updating room:', error);
          return of(null); // Return an observable that emits null in case of an error
        })
      );
  }

  // If the product is not found, return an observable that emits null
  return of(null); // Handle error if the product is not found
  }

  setSelectedProduct(product: any): void {
    this.productsSource.next(product);
  }

  getSelectedProduct(): Observable<any> {
    return this.productsSource.asObservable();
  }

  getProductById(id: any): any {
    // Lấy sản phẩm từ dữ liệu hiện tại
    const currentProducts = this.productsSource.value;
    return currentProducts.find(product => product.roomNumber === id);
  }


}
