import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'filter',
  // standalone: true // Consider making it standalone if your components are
})
export class FilterPipe implements PipeTransform {
  transform(items: any[], searchText: string, fields: string[] = []): any[] {
    if (!items) {
      return [];
    }
    if (!searchText) {
      return items;
    }
    searchText = searchText.toLowerCase();

    return items.filter(item => {
      if (!item) return false; // Add null check for item

      if (fields.length > 0) {
        // Search only in specified fields
        return fields.some(field => {
          const fieldValue = this.resolveField(item, field);
          // Check if fieldValue is not null or undefined before calling toString()
          return fieldValue !== null && fieldValue !== undefined && fieldValue.toString().toLowerCase().includes(searchText);
        });
      } else {
        // Search in all string fields if no fields specified (basic implementation)
        return Object.keys(item).some(key => {
          const fieldValue = item[key];
          return typeof fieldValue === 'string' && fieldValue.toLowerCase().includes(searchText);
        });
      }
    });
  }

  private resolveField(obj: any, path: string): any {
    // Helper to access potentially nested properties like 'payment.status'
     if (!obj || !path) return null;
     return path.split('.').reduce((prev, curr) => (prev ? prev[curr] : null), obj);
  }
} 