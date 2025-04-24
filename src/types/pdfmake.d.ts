declare module 'pdfmake/build/pdfmake' {
  const pdfMake: {
    createPdf: (documentDefinition: any) => {
      open: () => void;
      download: (defaultFileName?: string) => void;
      print: () => void;
      getBlob: (callback: (blob: Blob) => void) => void;
      getDataUrl: (callback: (dataUrl: string) => void) => void;
      getBase64: (callback: (data: string) => void) => void;
      getBuffer: (callback: (buffer: ArrayBuffer) => void) => void;
    };
    vfs: any;
  };
  
  export default pdfMake;
}

declare module 'pdfmake/build/vfs_fonts' {
  const pdfFonts: {
    pdfMake: {
      vfs: {
        [name: string]: string;
      };
    };
  };
  
  export default pdfFonts;
}

declare module 'pdfmake/interfaces' {
  export interface TDocumentDefinitions {
    content: any[];
    styles?: any;
    defaultStyle?: any;
    [key: string]: any;
  }
} 