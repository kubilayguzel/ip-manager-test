export function isValidBasedOnDate(hitApplicationDate, monitoredApplicationDate) {
  try {
    if (!hitApplicationDate || !monitoredApplicationDate) return true;
    
    const hitDate = new Date(hitApplicationDate);
    const monitoredDate = new Date(monitoredApplicationDate);
    
    // Geçersiz tarihler için true döndür
    if (isNaN(hitDate.getTime()) || isNaN(monitoredDate.getTime())) {
      return true;
    }
    
    // Hit'in tarihi izlenen markanın tarihinden önce veya aynı gün ise dahil et
    return hitDate <= monitoredDate;
    
  } catch (error) {
    console.error('Tarih karşılaştırma hatası:', error);
    return true; // Hata durumunda dahil et
  }
}

export function hasOverlappingNiceClasses(hitNiceClasses, monitoredNiceClasses) {
  try {
    if (!Array.isArray(hitNiceClasses) || !Array.isArray(monitoredNiceClasses)) {
      return false;
    }
    
    // Nice sınıflarını normalize et (sadece rakamları al)
    const normalizeClass = (cls) => {
      if (typeof cls === 'string') {
        return cls.replace(/\D/g, ''); // Sadece rakamları al
      }
      return String(cls);
    };
    
    const hitClasses = hitNiceClasses.map(normalizeClass).filter(cls => cls);
    const monitoredClasses = monitoredNiceClasses.map(normalizeClass).filter(cls => cls);
    
    // Kesişim kontrolü
    return hitClasses.some(hitClass => 
      monitoredClasses.some(monitoredClass => hitClass === monitoredClass)
    );
    
  } catch (error) {
    console.error('Nice class karşılaştırma hatası:', error);
    return false;
  }
}