import { isKids } from '../tvOS.js';
import { SettingActionRenderer, SettingsCategory } from './ytUI.js';
import { t } from 'i18next';

function PatchSettings(settingsObject) {
    if (!Array.isArray(settingsObject?.items)) return;
    // A response can be patched more than once or reused from native caches.
    // Remove only our own category; leave every native category untouched.
    settingsObject.items = settingsObject.items.filter(item =>
        item.settingCategoryCollectionRenderer?.categoryId !== 'tizentube_category');
    if (isKids()) return;
    const tizentubeOpenAction = SettingActionRenderer(
        t('settings.ttSettings.title'),
        'tizentube_open_action',
        {
            customAction: {
                action: 'TT_SETTINGS_SHOW',
                parameters: []
            }
        },
        t('settings.ttSettings.summary'),
        'https://www.gstatic.com/ytlr/img/parent_code.png'
    )

    const tizenTubeCategory = SettingsCategory(
        'tizentube_category',
        [tizentubeOpenAction]
    );
    // Add it as the first item in the settings object
    settingsObject.items.unshift(tizenTubeCategory);

}

export {
    PatchSettings
}