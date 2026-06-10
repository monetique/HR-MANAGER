const fs = require('fs');
const path = '/data/applications/hr-manager/frontend/src/pages/LeaveRequestPage.jsx';
let code = fs.readFileSync(path, 'utf8');

// 1. Ajouter half_day et half_day_period dans le state initial
code = code.replace(
  "  const [form, setForm] = useState({\n    leave_type_id: '',\n    start_date: '',\n    end_date: '',\n    reason: '',\n    certificate_path: '',\n  })",
  "  const [form, setForm] = useState({\n    leave_type_id: '',\n    start_date: '',\n    end_date: '',\n    reason: '',\n    certificate_path: '',\n    half_day: false,\n    half_day_period: 'matin',\n  })"
);

// 2. Corriger le calcul estimatedDays pour tenir compte demi-journée
code = code.replace(
  "  const estimatedDays = form.start_date && form.end_date\n    ? Math.max(0, differenceInBusinessDays(new Date(form.end_date), new Date(form.start_date)) + 1)\n    : 0",
  "  const estimatedDays = form.half_day\n    ? 0.5\n    : form.start_date && form.end_date\n      ? Math.max(0, differenceInBusinessDays(new Date(form.end_date), new Date(form.start_date)) + 1)\n      : 0"
);

// 3. Forcer end_date = start_date si demi-journée activée
code = code.replace(
  "              onChange={e => setForm({...form, start_date: e.target.value})}",
  "              onChange={e => setForm({...form, start_date: e.target.value, end_date: form.half_day ? e.target.value : form.end_date})}"
);

// 4. Ajouter le bloc demi-journée après le select type de congé et avant les dates
code = code.replace(
  "        <div className=\"grid grid-cols-2 gap-4\">",
  `        {/* Option demi-journée */}
        {selectedType && selectedType.code !== '0480' && (
          <div className="p-3 bg-gray-800/50 rounded-lg space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => setForm(f => ({ ...f, half_day: !f.half_day, end_date: !f.half_day ? f.start_date : f.end_date }))}
                className={\`relative w-10 h-5 rounded-full transition-colors \${form.half_day ? 'bg-blue-600' : 'bg-gray-600'}\`}
              >
                <div className={\`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform \${form.half_day ? 'translate-x-5' : ''}\`} />
              </div>
              <span className="text-sm text-gray-300 font-medium">Demi-journée (0.5 jour)</span>
            </label>
            {form.half_day && (
              <div className="flex gap-3 ml-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="half_day_period" value="matin"
                    checked={form.half_day_period === 'matin'}
                    onChange={e => setForm({...form, half_day_period: e.target.value})} />
                  <span className="text-gray-300 text-sm">🌅 Matin</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="half_day_period" value="apremidi"
                    checked={form.half_day_period === 'apremidi'}
                    onChange={e => setForm({...form, half_day_period: e.target.value})} />
                  <span className="text-gray-300 text-sm">🌇 Après-midi</span>
                </label>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">`
);

// 5. Désactiver end_date si demi-journée
code = code.replace(
  "              min={form.start_date || new Date().toISOString().split('T')[0]} required />",
  "              min={form.start_date || new Date().toISOString().split('T')[0]}\n              disabled={form.half_day}\n              value={form.half_day ? form.start_date : form.end_date}\n              required />"
);

// 6. Mettre à jour le message durée estimée
code = code.replace(
  "              Durée estimée : <strong>{estimatedDays} jour(s) ouvrable(s)</strong>",
  "              Durée estimée : <strong>{form.half_day ? '0.5 jour (demi-journée ' + (form.half_day_period === 'matin' ? 'matin' : 'après-midi') + ')' : estimatedDays + ' jour(s) ouvrable(s)'}</strong>"
);

fs.writeFileSync(path, code);
console.log('OK LeaveRequestPage.jsx patche');
