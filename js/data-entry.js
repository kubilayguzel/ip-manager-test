// portfolio-entry.js
import { initializeNiceClassification } from './nice-classification.js';
import { createTrademarkApplication } from './create-task.js'; // eğer backend kaydı gerekiyorsa
import { personService, transactionTypeService } from '../firebase-config.js'; // aynı yapıda import edebilirsiniz

class PortfolioEntryModule {
  constructor() {
    this.ipTypeSelect    = document.getElementById('ipTypeSelect');
    this.formContainer   = document.getElementById('formContainer');
    this.isNiceInit      = false;
    this.selectedApplicants = [];
  }

  async init() {
    this.ipTypeSelect.addEventListener('change', e => this.handleTypeChange(e.target.value));
  }

  handleTypeChange(type) {
    this.formContainer.innerHTML = '';
    this.isNiceInit = false;
    this.selectedApplicants = [];

    switch(type) {
      case 'trademark':
        this.renderTrademarkForm();
        break;
      case 'patent':
        this.renderPatentForm();
        break;
      case 'design':
        this.renderDesignForm();
        break;
      default:
        // hiçbir şey
    }
  }

  renderTrademarkForm() {
    this.formContainer.innerHTML = `
      <ul class="nav nav-tabs" id="tabs" role="tablist">
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
      <div class="tab-content p-4 border">
        <div id="brand-info" class="tab-pane fade show active">
          <!-- marka bilgileri -->
          <div class="form-group">
            <label>Marka Tipi</label>
            <select id="brandType" class="form-control">
              <option value="Sadece Kelime">Sadece Kelime</option>
              <option value="Şekil + Kelime">Şekil + Kelime</option>
              <!-- vs. -->
            </select>
          </div>
          <!-- diğer alanlar... -->
        </div>
        <div id="goods-services" class="tab-pane fade">
          <div id="niceClassificationList"></div>
          <div id="selectedNiceClasses"></div>
        </div>
        <div id="applicants" class="tab-pane fade">
          <div class="form-group">
            <label>Başvuru Sahibi Ara</label>
            <input type="text" id="applicantSearch" class="form-control" placeholder="İsimle ara...">
            <div id="applicantResults" class="border mt-1" style="display:none; max-height:200px; overflow:auto;"></div>
          </div>
          <div id="selectedApplicants"></div>
        </div>
        <div id="priority" class="tab-pane fade">
          <!-- rüçhan tarihi vb. alanlar -->
          <div class="form-group">
            <label>Rüçhan Tarihi</label>
            <input type="date" id="priorityDate" class="form-control">
          </div>
        </div>
      </div>
      <div class="mt-4 text-right">
        <button id="saveBtn" class="btn btn-success">Kaydet</button>
      </div>
    `;

    // Sekme event’leri
    $('#tabs a').on('shown.bs.tab', e => {
      const id = e.target.getAttribute('href').substring(1);
      if (id === 'goods-services' && !this.isNiceInit) {
        initializeNiceClassification();
        this.isNiceInit = true;
      }
      if (id === 'applicants') {
        this.setupApplicantSearch();
      }
    });

    // Kaydet butonu
    document.getElementById('saveBtn').addEventListener('click', () => {
      // form verilerini alıp backend’e yolla
      // örn: createTrademarkApplication({...})
      alert('Kaydetme işlemi burada yapılacak');
    });
  }

  renderPatentForm() {
    this.formContainer.innerHTML = `
      <h5>Patent Başvurusu</h5>
      <div class="form-group">
        <label>Başvuru No</label>
        <input type="text" id="patentNo" class="form-control">
      </div>
      <div class="form-group">
        <label>Başlık</label>
        <input type="text" id="patentTitle" class="form-control">
      </div>
      <div class="form-group">
        <label>Başvuru Sahibi</label>
        <input type="text" id="patentApplicant" class="form-control">
      </div>
      <div class="text-right">
        <button id="savePatentBtn" class="btn btn-success">Kaydet</button>
      </div>
    `;

    document.getElementById('savePatentBtn').addEventListener('click', () => {
      alert('Patent kaydı burada yapılacak');
    });
  }

  renderDesignForm() {
    this.formContainer.innerHTML = `
      <h5>Tasarım Başvurusu</h5>
      <div class="form-group">
        <label>Başvuru No</label>
        <input type="text" id="designNo" class="form-control">
      </div>
      <div class="form-group">
        <label>Açıklama</label>
        <textarea id="designDesc" class="form-control"></textarea>
      </div>
      <div class="text-right">
        <button id="saveDesignBtn" class="btn btn-success">Kaydet</button>
      </div>
    `;

    document.getElementById('saveDesignBtn').addEventListener('click', () => {
      alert('Tasarım kaydı burada yapılacak');
    });
  }

  setupApplicantSearch() {
    const inp = document.getElementById('applicantSearch');
    const res = document.getElementById('applicantResults');
    inp.addEventListener('input', async e => {
      const q = e.target.value.trim();
      if (q.length < 2) { res.style.display='none'; return; }
      const list = await personService.getPersons({ query: q });
      res.innerHTML = list.data.map(p =>
        `<div class="p-2 search-item" data-id="${p.id}">${p.name}</div>`
      ).join('');
      res.style.display = 'block';
      document.querySelectorAll('.search-item').forEach(el=>{
        el.onclick = () => {
          this.selectedApplicants.push({ id:el.dataset.id, name:el.textContent });
          this.renderSelectedApplicants();
          res.style.display='none';
          inp.value='';
        };
      });
    });
  }

  renderSelectedApplicants() {
    const c = document.getElementById('selectedApplicants');
    c.innerHTML = this.selectedApplicants.map(a=>{
      return `<div class="badge badge-primary mr-1">${a.name}</div>`;
    }).join('') || '<small>Henüz seçilmedi</small>';
  }
}

window.addEventListener('DOMContentLoaded', ()=> {
  new PortfolioEntryModule().init();
});
