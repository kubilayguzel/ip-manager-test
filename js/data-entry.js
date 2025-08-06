// js/data-entry.js
import { initializeNiceClassification } from './nice-classification.js';
import { personService } from '../firebase-config.js'; // yolunuzu düzenleyin

class DataEntryModule {
  constructor() {
    this.ipTypeSelect = document.getElementById('ipTypeSelect');
    this.formContainer = document.getElementById('formContainer');

    this.isNiceInitialized = false;
    this.selectedApplicants = [];
  }

  init() {
    // IP türü değiştiğinde formu render et
    this.ipTypeSelect.addEventListener('change', e =>
      this.handleTypeChange(e.target.value)
    );
  }

  handleTypeChange(type) {
    this.formContainer.innerHTML = '';
    this.isNiceInitialized = false;
    this.selectedApplicants = [];

    if (type === 'trademark') this.renderTrademarkForm();
    else if (type === 'patent') this.renderPatentForm();
    else if (type === 'design') this.renderDesignForm();
  }

  renderTrademarkForm() {
    this.formContainer.innerHTML = `
      <ul class="nav nav-tabs" id="dataTabs" role="tablist">
        <li class="nav-item">
          <a class="nav-link active" data-toggle="tab" href="#brand-info">Marka Bilgileri</a>
        </li>
        <li class="nav-item">
          <a class="nav-link" data-toggle="tab" href="#goods-services">Mal/Hizmet</a>
        </li>
        <li class="nav-item">
          <a class="nav-link" data-toggle="tab" href="#applicants">Başvuru Sahibi</a>
        </li>
        <li class="nav-item">
          <a class="nav-link" data-toggle="tab" href="#priority">Rüçhan</a>
        </li>
      </ul>
      <div class="tab-content border p-3">
        <!-- Marka Bilgileri -->
        <div class="tab-pane fade show active" id="brand-info">
          <div class="form-group">
            <label for="brandType">Marka Tipi</label>
            <select id="brandType" class="form-control">
              <option value="Sadece Kelime">Sadece Kelime</option>
              <option value="Şekil + Kelime">Şekil + Kelime</option>
            </select>
          </div>
          <div class="form-group">
            <label for="brandName">Marka Adı</label>
            <input type="text" id="brandName" class="form-control" />
          </div>
          <!-- İhtiyaca göre diğer alanlar -->
        </div>

        <!-- Mal/Hizmet -->
        <div class="tab-pane fade" id="goods-services">
          <div id="niceClassificationList" class="mb-2"></div>
          <div id="selectedNiceClasses"></div>
        </div>

        <!-- Başvuru Sahibi -->
        <div class="tab-pane fade" id="applicants">
          <div class="form-group">
            <label for="applicantSearch">Başvuru Sahibi Ara</label>
            <input
              type="text"
              id="applicantSearch"
              class="form-control"
              placeholder="İsimle ara..."
            />
            <div
              id="applicantResults"
              class="list-group mt-1"
              style="display:none; max-height:200px; overflow-y:auto;"
            ></div>
          </div>
          <div id="selectedApplicants" class="mt-2"></div>
        </div>

        <!-- Rüçhan -->
        <div class="tab-pane fade" id="priority">
          <div class="form-group">
            <label for="priorityDate">Rüçhan Tarihi</label>
            <input type="date" id="priorityDate" class="form-control" />
          </div>
        </div>
      </div>

      <div class="text-right mt-3">
        <button id="saveBtn" class="btn btn-primary">Kaydet</button>
      </div>
    `;

    // Tab değişimlerinde gereken işlemler
    $('#dataTabs a').on('shown.bs.tab', e => {
      const tabId = e.target.getAttribute('href').substring(1);

      // Mal/Hizmet sekmesi açıldığında Nice Classification
      if (tabId === 'goods-services' && !this.isNiceInitialized) {
        initializeNiceClassification();
        this.isNiceInitialized = true;
      }

      // Başvuru Sahibi sekmesi açıldığında arama
      if (tabId === 'applicants') {
        this.setupApplicantSearch();
      }
    });

    // Kaydet tuşu
    document
      .getElementById('saveBtn')
      .addEventListener('click', () => this.handleSave());
  }

  renderPatentForm() {
    this.formContainer.innerHTML = `
      <h5>Patent Kaydı</h5>
      <div class="form-group">
        <label for="patentNo">Başvuru No</label>
        <input type="text" id="patentNo" class="form-control" />
      </div>
      <div class="form-group">
        <label for="patentTitle">Başlık</label>
        <input type="text" id="patentTitle" class="form-control" />
      </div>
      <div class="form-group">
        <label for="patentApplicant">Başvuru Sahibi</label>
        <input type="text" id="patentApplicant" class="form-control" />
      </div>
      <div class="text-right">
        <button id="savePatentBtn" class="btn btn-primary">Kaydet</button>
      </div>
    `;
    document
      .getElementById('savePatentBtn')
      .addEventListener('click', () => this.handleSave());
  }

  renderDesignForm() {
    this.formContainer.innerHTML = `
      <h5>Tasarım Kaydı</h5>
      <div class="form-group">
        <label for="designNo">Başvuru No</label>
        <input type="text" id="designNo" class="form-control" />
      </div>
      <div class="form-group">
        <label for="designDesc">Açıklama</label>
        <textarea id="designDesc" class="form-control"></textarea>
      </div>
      <div class="text-right">
        <button id="saveDesignBtn" class="btn btn-primary">Kaydet</button>
      </div>
    `;
    document
      .getElementById('saveDesignBtn')
      .addEventListener('click', () => this.handleSave());
  }

  setupApplicantSearch() {
    const inp = document.getElementById('applicantSearch');
    const res = document.getElementById('applicantResults');

    inp.addEventListener('input', async e => {
      const q = e.target.value.trim();
      if (q.length < 2) {
        res.style.display = 'none';
        return;
      }

      const list = await personService.searchApplicants(q);
      res.innerHTML = '';
      list.forEach(p => {
        const a = document.createElement('a');
        a.href = '#';
        a.className = 'list-group-item list-group-item-action';
        a.textContent = p.name;
        a.onclick = () => {
          this.selectedApplicants.push(p);
          this.renderSelectedApplicants();
          res.style.display = 'none';
          inp.value = '';
        };
        res.appendChild(a);
      });
      res.style.display = 'block';
    });
  }

  renderSelectedApplicants() {
    const c = document.getElementById('selectedApplicants');
    c.innerHTML =
      this.selectedApplicants
        .map(a => `<span class="badge badge-info mr-1">${a.name}</span>`)
        .join('') || '<small>Henüz seçilmedi</small>';
  }

  handleSave() {
    // Tüm formlardan veri topla
    const payload = {
      type: this.ipTypeSelect.value,
      // Örnek: marka
      brand: {
        type: document.getElementById('brandType')?.value,
        name: document.getElementById('brandName')?.value,
        niceClasses: Array.from(
          document.querySelectorAll('#selectedNiceClasses .badge')
        ).map(b => b.textContent),
        applicants: this.selectedApplicants,
        priorityDate: document.getElementById('priorityDate')?.value,
      },
      // patent/design için benzer
    };

    console.log('🗂 Kayıt verisi:', payload);
    // TODO: Burada backend call yapılacak (Firebase, API vb.)
    alert('Kayıt başarıyla işlendi.');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new DataEntryModule().init();
});
